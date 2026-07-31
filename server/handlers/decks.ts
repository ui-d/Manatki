import { defineEventHandler, setResponseStatus, createEventStream } from "h3";

import { resolveSlidesRequestAuthContext } from "./request-auth-context.js";

// --- SSE for change notifications ---
type SSEPush = (data: string) => void;

// CRITICAL: pin the client registry to globalThis.
//
// In Nitro dev mode, server route files (events.get.ts) are loaded by
// vite-node/Rollup, while action files are loaded by autoDiscoverActions via
// plain `await import(absolutePath)`. These two loaders produce SEPARATE
// module instances of this file — a module-level `new Set()` would give the
// SSE route and the actions two different Sets, so broadcasts from actions
// would never reach connected clients. Pinning to globalThis forces a single
// shared registry regardless of how this module was loaded.
const GLOBAL_KEY = "__slidesSSEClients" as const;
type GlobalWithClients = typeof globalThis & {
  [GLOBAL_KEY]?: Set<SSEPush>;
};
const globalRef = globalThis as GlobalWithClients;
if (!globalRef[GLOBAL_KEY]) {
  globalRef[GLOBAL_KEY] = new Set<SSEPush>();
}
const sseClients: Set<SSEPush> = globalRef[GLOBAL_KEY]!;

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
}

/**
 * Broadcast a deck change to all connected UI clients. Exported so agent
 * actions (add-slide, update-slide, create-deck) can notify the frontend
 * after a direct DB write — otherwise the UI has no way to know the deck
 * was modified until the next 3-second poll, and won't notice content
 * changes to slides inside an existing deck at all.
 *
 * The second argument accepts either a legacy `type` string (backwards compat
 * with callers like `notifyClients(id, "deck-deleted")`) or an options object
 * carrying `slideId` / `actor` so the client can attribute agent edits to a
 * specific slide. The wire payload always includes `type` and `deckId`; extra
 * fields are only present when supplied.
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
  for (const push of sseClients) {
    try {
      push(message);
    } catch {
      sseClients.delete(push);
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

  // Register this client's push function
  const push: SSEPush = (data: string) => {
    eventStream.push(data);
  };
  sseClients.add(push);

  const retireTimer = setTimeout(() => {
    void eventStream.close();
  }, SSE_MAX_CONNECTION_MS);

  eventStream.onClosed(() => {
    clearTimeout(retireTimer);
    sseClients.delete(push);
  });

  return eventStream.send();
});
