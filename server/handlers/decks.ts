import { eq } from "drizzle-orm";
import { defineEventHandler, setResponseStatus, createEventStream } from "h3";

import { getDb, schema } from "../db/index.js";
import { resolveSlidesRequestAuthContext } from "./request-auth-context.js";

// --- SSE for change notifications ---
type SSEPush = (data: string) => void;

/** One subscribed browser tab, with the identity needed for scoped fan-out. */
interface SSEClient {
  push: SSEPush;
  email: string;
  orgId: string | null;
}

// CRITICAL: pin the client registry to globalThis.
//
// In Nitro dev mode, server route files (events.get.ts) are loaded by
// vite-node/Rollup, while action files are loaded by autoDiscoverActions via
// plain `await import(absolutePath)`. These two loaders produce SEPARATE
// module instances of this file — a module-level `new Set()` would give the
// SSE route and the actions two different Sets, so broadcasts from actions
// would never reach connected clients. Pinning to globalThis forces a single
// shared registry regardless of how this module was loaded.
// (V2 suffix: the entry shape changed from bare push fns to SSEClient
// records; a stale V1 Set from an old module instance must not mix in.)
const GLOBAL_KEY = "__slidesSSEClientsV2" as const;
type GlobalWithClients = typeof globalThis & {
  [GLOBAL_KEY]?: Set<SSEClient>;
};
const globalRef = globalThis as GlobalWithClients;
if (!globalRef[GLOBAL_KEY]) {
  globalRef[GLOBAL_KEY] = new Set<SSEClient>();
}
const sseClients: Set<SSEClient> = globalRef[GLOBAL_KEY]!;

/**
 * Who is allowed to receive a broadcast about a deck. Callers that already
 * hold the deck row (every write action does) should pass this so delivery
 * needs no extra DB read — and MUST pass it for deck-deleted, where the row
 * is already gone.
 */
export interface NotifyAudience {
  ownerEmail: string;
  orgId?: string | null;
  visibility?: string | null;
}

/**
 * Options for a deck-change broadcast. All fields are optional and additive so
 * existing consumers that only read `{ type, deckId }` keep working.
 */
export interface NotifyClientsOptions {
  /** SSE event type — defaults to "deck-changed". */
  type?: string;
  /** The specific slide that changed, when known (agent slide edits). */
  slideId?: string;
  /** Who made the change: "agent" for AI writes, "human" otherwise. */
  actor?: "agent" | "human";
  /** Delivery scope; loaded from the deck row when omitted. */
  audience?: NotifyAudience;
}

/**
 * Broadcast a deck change to connected UI clients WITH ACCESS to the deck.
 * Exported so agent actions (add-slide, update-slide, create-deck) can notify
 * the frontend after a direct DB write.
 *
 * Delivery is scoped (H6): a client receives the event only if they own the
 * deck, share its org while visibility is "org", or hold a per-user/per-org
 * grant in deck_shares. Previously every authenticated user received every
 * deck id — a cross-tenant activity leak that also triggered a full get-deck
 * refetch in every open browser.
 *
 * The second argument accepts either a legacy `type` string (backwards compat
 * with callers like `notifyClients(id, "deck-deleted")`) or an options object
 * carrying `slideId` / `actor` / `audience`. The wire payload always includes
 * `type` and `deckId`; extra fields are only present when supplied.
 */
export function notifyClients(
  deckId: string,
  typeOrOptions: string | NotifyClientsOptions = "deck-changed",
) {
  const options: NotifyClientsOptions =
    typeof typeOrOptions === "string" ? { type: typeOrOptions } : typeOrOptions;
  const type = options.type ?? "deck-changed";
  const payload: Record<string, unknown> = { type, deckId };
  if (options.slideId) payload.slideId = options.slideId;
  if (options.actor) payload.actor = options.actor;
  const message = JSON.stringify(payload);
  if (process.env.DEBUG_SLIDES_SSE) {
    console.log(
      `[slides-sse] notifyClients deck=${deckId} type=${type} slide=${options.slideId ?? "-"} actor=${options.actor ?? "-"} clients=${sseClients.size}`,
    );
  }
  if (sseClients.size === 0) return;
  void deliverScoped(deckId, message, options.audience).catch(
    (err: unknown) => {
      // A failed delivery pass only delays the affected tabs until their
      // next poll/resync — never let it take down the write path.
      console.warn(
        "[slides-sse] scoped delivery failed:",
        err instanceof Error ? err.message : err,
      );
    },
  );
}

async function deliverScoped(
  deckId: string,
  message: string,
  audience?: NotifyAudience,
): Promise<void> {
  let aud = audience;
  if (!aud) {
    const db = getDb();
    const rows = await db
      .select({
        ownerEmail: schema.decks.ownerEmail,
        orgId: schema.decks.orgId,
        visibility: schema.decks.visibility,
      })
      .from(schema.decks)
      .where(eq(schema.decks.id, deckId))
      .limit(1);
    // Row gone (deleted deck) and no audience supplied: deliver to no one
    // rather than to everyone — stragglers catch up via poll/resync.
    if (!rows[0]) return;
    aud = rows[0];
  }

  const ownerEmail = aud.ownerEmail?.trim().toLowerCase() ?? "";
  const recipients: SSEClient[] = [];
  const undecided: SSEClient[] = [];
  for (const client of sseClients) {
    const email = client.email.toLowerCase();
    if (email === ownerEmail) {
      recipients.push(client);
    } else if (
      aud.visibility === "org" &&
      aud.orgId &&
      client.orgId === aud.orgId
    ) {
      recipients.push(client);
    } else {
      undecided.push(client);
    }
  }

  // Per-user / per-org grants: one indexed query per broadcast, only when
  // someone is still undecided. Any role counts — a viewer grant is enough
  // to be told the deck changed.
  if (undecided.length > 0) {
    const db = getDb();
    const shares = await db
      .select({
        principalType: schema.deckShares.principalType,
        principalId: schema.deckShares.principalId,
      })
      .from(schema.deckShares)
      .where(eq(schema.deckShares.resourceId, deckId));
    if (shares.length > 0) {
      const userGrants = new Set<string>();
      const orgGrants = new Set<string>();
      for (const share of shares) {
        if (share.principalType === "user") {
          userGrants.add(String(share.principalId).toLowerCase());
        } else if (share.principalType === "org") {
          orgGrants.add(String(share.principalId));
        }
      }
      for (const client of undecided) {
        if (
          userGrants.has(client.email.toLowerCase()) ||
          (client.orgId && orgGrants.has(client.orgId))
        ) {
          recipients.push(client);
        }
      }
    }
  }

  if (process.env.DEBUG_SLIDES_SSE) {
    console.log(
      `[slides-sse] deliver deck=${deckId} recipients=${recipients.length}/${sseClients.size}`,
    );
  }
  for (const client of recipients) {
    try {
      client.push(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

/**
 * How long a single SSE connection is allowed to live before the server
 * closes it and lets the browser reconnect.
 *
 * Serverless hosts cap function duration (Vercel's default is 300s). An SSE
 * handler holds the invocation open for as long as the client stays
 * subscribed, so without this it always runs into that ceiling and the
 * platform kills it — surfacing as a "Task timed out after 300 seconds"
 * runtime error on every connection, roughly every five minutes per open tab.
 *
 * Retiring the stream ourselves, comfortably under the cap, turns those hard
 * timeouts into clean EOFs. EventSource reconnects automatically on a clean
 * close, and DeckContext's `onopen` resyncs deck state on every reconnect
 * after the first, so no broadcast missed during the gap is lost.
 */
const SSE_MAX_CONNECTION_MS = 240_000;

// SSE endpoint — client subscribes for real-time change notifications.
// Per-deckId notifications carry only the id, no row contents, so we don't
// gate this — but we do require an authenticated session so anonymous
// callers can't tail the stream. (The agent path runs server-side and is
// not affected.)
export const deckEvents = defineEventHandler(async (event) => {
  const session = await resolveSlidesRequestAuthContext(event);
  if (!session.email) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }
  const eventStream = createEventStream(event);

  // Send initial connected event
  eventStream.push(JSON.stringify({ type: "connected" }));

  // Register this client with the identity used for scoped delivery.
  const client: SSEClient = {
    push: (data: string) => {
      eventStream.push(data);
    },
    email: session.email,
    orgId: session.orgId ?? null,
  };
  sseClients.add(client);

  const retireTimer = setTimeout(() => {
    void eventStream.close();
  }, SSE_MAX_CONNECTION_MS);

  eventStream.onClosed(() => {
    clearTimeout(retireTimer);
    sseClients.delete(client);
  });

  return eventStream.send();
});
