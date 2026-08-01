import crypto from "crypto";

import { readBody } from "@agent-native/core/server";
import { assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { toSharedDeckSlide } from "@shared/api";
import type {
  ShareDeckRequest,
  ShareDeckResponse,
  ShareLinkStatsResponse,
  ShareLinkSummary,
  SharedDeckResponse,
} from "@shared/api";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import {
  defineEventHandler,
  getQuery,
  getRouterParam,
  setResponseStatus,
} from "h3";
import { z } from "zod";

import { getDb, schema } from "../db";
import {
  resolveSlidesRequestAuthContext,
  withSlidesRequestContext,
} from "./request-auth-context.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A link is live when it exists, is not revoked, and is within its TTL.
 * Every public endpoint must apply exactly this check and answer dead links
 * with the same 404 body as missing ones, so tokens cannot be probed.
 */
function isShareLinkLive(link: {
  createdAt: string;
  revokedAt?: string | null;
}): boolean {
  if (link.revokedAt) return false;
  return Date.now() - new Date(link.createdAt).getTime() <= THIRTY_DAYS_MS;
}

const SHARE_LINK_GONE = "Shared presentation not found or has expired";

/**
 * POST /api/share
 * Persist a deck snapshot with a random token.
 */
export const shareDeck = defineEventHandler(async (event) => {
  const body = await readBody<ShareDeckRequest>(event);
  const { deck } = body;

  if (!deck?.id) {
    setResponseStatus(event, 400);
    return { error: "Deck id is required" };
  }

  // Pre-resolve so we can 401 before opening the request-context scope,
  // and pass the resolved context into `withSlidesRequestContext` so it
  // doesn't re-resolve session + org on the same request (which would
  // double the session/getOrgContext I/O per share).
  const session = await resolveSlidesRequestAuthContext(event);
  if (!session.email) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  return withSlidesRequestContext(
    event,
    async () => createShareLink(event, deck.id, session.email as string),
    session,
  );
});

async function createShareLink(event: any, deckId: string, ownerEmail: string) {
  const db = getDb();
  let storedDeck: any;
  let title = "Untitled";

  try {
    const access = await assertAccess("deck", deckId, "admin");
    title = access.resource.title ?? "Untitled";
    storedDeck = JSON.parse(access.resource.data);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      setResponseStatus(event, err.statusCode);
      return { error: err.message };
    }
    throw err;
  }

  if (!Array.isArray(storedDeck?.slides) || storedDeck.slides.length === 0) {
    setResponseStatus(event, 400);
    return { error: "Deck with slides is required" };
  }

  const token = crypto.randomBytes(12).toString("base64url");
  const now = new Date().toISOString();

  const slides = storedDeck.slides.map((slide: unknown, index: number) =>
    toSharedDeckSlide(slide, index),
  );
  const kind = storedDeck.kind === "social" ? "social" : "deck";

  await db.insert(schema.deckShareLinks).values({
    token,
    title: title || storedDeck.title || "Untitled",
    // Envelope carries the project kind without a new column; the reader
    // still accepts the legacy bare-array shape from pre-social snapshots.
    slides: JSON.stringify({ kind, slides }),
    aspectRatio: storedDeck.aspectRatio ?? null,
    createdAt: now,
    ownerEmail,
    deckId,
  });

  // Prune expired rows opportunistically (no await — background). Analytics
  // events share their parent link's TTL, so prune them on the same trigger.
  const pruneCutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  db.delete(schema.deckShareLinks)
    .where(lt(schema.deckShareLinks.createdAt, pruneCutoff))
    .catch(() => {});
  db.delete(schema.shareLinkEvents)
    .where(lt(schema.shareLinkEvents.createdAt, pruneCutoff))
    .catch(() => {});

  const response: ShareDeckResponse = { shareToken: token };
  return response;
}

/**
 * GET /api/share/:token
 * Retrieve a shared deck by token.
 */
export const getSharedDeck = defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token");
  if (!token) {
    setResponseStatus(event, 400);
    return { error: "Token is required" };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.deckShareLinks)
    .where(eq(schema.deckShareLinks.token, token))
    .limit(1);

  const shared = rows[0];
  if (!shared) {
    setResponseStatus(event, 404);
    return { error: SHARE_LINK_GONE };
  }

  // Revoked and expired links 404 identically to missing ones so a dead
  // token leaks nothing about whether it ever existed.
  if (!isShareLinkLive(shared)) {
    setResponseStatus(event, 404);
    return { error: SHARE_LINK_GONE };
  }

  // Legacy rows store a bare slide array; newer rows wrap it in an
  // envelope that also carries the project kind.
  const parsed = JSON.parse(shared.slides);
  const isEnvelope =
    !Array.isArray(parsed) && parsed && typeof parsed === "object";
  const slides = isEnvelope
    ? Array.isArray(parsed.slides)
      ? parsed.slides
      : []
    : parsed;

  const response: SharedDeckResponse = {
    title: shared.title,
    slides,
    aspectRatio: shared.aspectRatio as SharedDeckResponse["aspectRatio"],
    kind: isEnvelope && parsed.kind === "social" ? "social" : "deck",
  };
  return response;
});

/**
 * GET /api/share?deckId=...
 * List active (unrevoked, unexpired) snapshot links for a deck. Requires
 * admin access on the deck — the same bar as creating a link.
 */
export const listShareLinks = defineEventHandler(async (event) => {
  const deckId = String(getQuery(event).deckId ?? "");
  if (!deckId) {
    setResponseStatus(event, 400);
    return { error: "deckId is required" };
  }

  const session = await resolveSlidesRequestAuthContext(event);
  if (!session.email) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  return withSlidesRequestContext(
    event,
    async () => {
      try {
        await assertAccess("deck", deckId, "admin");
      } catch (err) {
        if (err instanceof ForbiddenError) {
          setResponseStatus(event, err.statusCode);
          return { error: err.message };
        }
        throw err;
      }

      const db = getDb();
      const rows = await db
        .select({
          token: schema.deckShareLinks.token,
          createdAt: schema.deckShareLinks.createdAt,
        })
        .from(schema.deckShareLinks)
        .where(
          and(
            eq(schema.deckShareLinks.deckId, deckId),
            isNull(schema.deckShareLinks.revokedAt),
            gt(
              schema.deckShareLinks.createdAt,
              new Date(Date.now() - THIRTY_DAYS_MS).toISOString(),
            ),
          ),
        )
        .orderBy(desc(schema.deckShareLinks.createdAt));

      const links: ShareLinkSummary[] = await attachViewStats(db, rows);
      return { links };
    },
    session,
  );
});

/**
 * Merge per-token view aggregates into the link rows. `sum(case …)` and
 * string-coerced counts keep the SQL portable across SQLite and Postgres
 * (Postgres returns bigint aggregates as strings).
 */
async function attachViewStats(
  db: ReturnType<typeof getDb>,
  rows: Array<{ token: string; createdAt: string }>,
): Promise<ShareLinkSummary[]> {
  if (rows.length === 0) return [];

  const stats = await db
    .select({
      token: schema.shareLinkEvents.token,
      viewCount: sql<string>`sum(case when ${schema.shareLinkEvents.eventType} = 'view' then 1 else 0 end)`,
      uniqueSessions: sql<string>`count(distinct ${schema.shareLinkEvents.sessionId})`,
      // Filtered to page views so phase-2 `slide` dwell events cannot skew
      // the "last viewed" label shown in the UI.
      lastViewedAt: sql<string>`max(case when ${schema.shareLinkEvents.eventType} = 'view' then ${schema.shareLinkEvents.createdAt} end)`,
    })
    .from(schema.shareLinkEvents)
    .where(
      inArray(
        schema.shareLinkEvents.token,
        rows.map((row) => row.token),
      ),
    )
    .groupBy(schema.shareLinkEvents.token);

  const byToken = new Map(stats.map((stat) => [stat.token, stat]));
  return rows.map((row) => {
    const stat = byToken.get(row.token);
    return {
      ...row,
      viewCount: Number(stat?.viewCount ?? 0),
      uniqueSessions: Number(stat?.uniqueSessions ?? 0),
      lastViewedAt: stat?.lastViewedAt ?? null,
    };
  });
}

const MAX_EVENTS_PER_REQUEST = 20;
// Flood backstop for the unauthenticated beacon endpoint — far above any
// real audience for a single 30-day link, cheap to check per request.
const MAX_EVENTS_PER_TOKEN = 50_000;

const shareLinkEventsSchema = z.object({
  sessionId: z.string().min(8).max(64),
  events: z
    .array(
      z.object({
        type: z.enum(["view", "slide"]),
        slideIndex: z.number().int().min(0).max(9_999).optional(),
        dwellMs: z
          .number()
          .int()
          .min(0)
          .max(60 * 60 * 1000)
          .optional(),
      }),
    )
    .min(1)
    .max(MAX_EVENTS_PER_REQUEST),
});

/**
 * POST /api/share/:token/events
 * Anonymous viewer-analytics beacon for a share link. Unauthenticated by
 * design (viewers have no session), so it only ever appends bounded,
 * PII-free rows — and answers dead tokens exactly like getSharedDeck.
 */
export const recordShareLinkEvents = defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token");
  if (!token) {
    setResponseStatus(event, 400);
    return { error: "Token is required" };
  }

  const body = await readBody(event);
  const parsed = shareLinkEventsSchema.safeParse(body);
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return { error: "Invalid events payload" };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.deckShareLinks)
    .where(eq(schema.deckShareLinks.token, token))
    .limit(1);
  const link = rows[0];

  if (!link || !isShareLinkLive(link)) {
    setResponseStatus(event, 404);
    return { error: SHARE_LINK_GONE };
  }

  // Count-then-insert is not transactional, so concurrent requests at the
  // boundary can overshoot the cap by up to one batch — acceptable for an
  // anti-abuse backstop this far above any real audience.
  const existing = await db.$count(
    schema.shareLinkEvents,
    eq(schema.shareLinkEvents.token, token),
  );
  if (existing + parsed.data.events.length > MAX_EVENTS_PER_TOKEN) {
    setResponseStatus(event, 429);
    return { error: "Event limit reached for this link" };
  }

  const now = new Date().toISOString();
  await db.insert(schema.shareLinkEvents).values(
    parsed.data.events.map((entry) => ({
      id: crypto.randomUUID(),
      token,
      sessionId: parsed.data.sessionId,
      eventType: entry.type,
      slideIndex: entry.slideIndex ?? null,
      dwellMs: entry.dwellMs ?? null,
      createdAt: now,
    })),
  );

  return { success: true };
});

/**
 * Manage-level check shared by revoke and stats: the user who minted the
 * link, or anyone with admin access on the source deck. Callers must answer
 * a failed check with the same 404 as a missing token.
 */
async function canManageShareLink(
  link: { ownerEmail: string | null; deckId: string | null },
  email: string,
): Promise<boolean> {
  if (link.ownerEmail === email) return true;
  if (!link.deckId) return false;
  try {
    await assertAccess("deck", link.deckId, "admin");
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) return false;
    throw err;
  }
}

/**
 * GET /api/share/:token/stats
 * Per-slide engagement for a snapshot link — same access bar as revoking
 * it, and permission failures 404 exactly like missing tokens so tokens
 * cannot be probed.
 */
export const getShareLinkStats = defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token");
  if (!token) {
    setResponseStatus(event, 400);
    return { error: "Token is required" };
  }

  const session = await resolveSlidesRequestAuthContext(event);
  if (!session.email) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  return withSlidesRequestContext(
    event,
    async () => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.deckShareLinks)
        .where(eq(schema.deckShareLinks.token, token))
        .limit(1);
      const link = rows[0];

      if (!link || !(await canManageShareLink(link, session.email as string))) {
        setResponseStatus(event, 404);
        return { error: "Share link not found" };
      }

      const overallRows = await db
        .select({
          token: schema.shareLinkEvents.token,
          viewCount: sql<string>`sum(case when ${schema.shareLinkEvents.eventType} = 'view' then 1 else 0 end)`,
          uniqueSessions: sql<string>`count(distinct ${schema.shareLinkEvents.sessionId})`,
          lastViewedAt: sql<string>`max(case when ${schema.shareLinkEvents.eventType} = 'view' then ${schema.shareLinkEvents.createdAt} end)`,
        })
        .from(schema.shareLinkEvents)
        .where(eq(schema.shareLinkEvents.token, token))
        .groupBy(schema.shareLinkEvents.token);
      const overall = overallRows[0];

      const slideRows = await db
        .select({
          slideIndex: schema.shareLinkEvents.slideIndex,
          viewers: sql<string>`count(distinct ${schema.shareLinkEvents.sessionId})`,
          totalDwellMs: sql<string>`coalesce(sum(${schema.shareLinkEvents.dwellMs}), 0)`,
        })
        .from(schema.shareLinkEvents)
        .where(
          and(
            eq(schema.shareLinkEvents.token, token),
            eq(schema.shareLinkEvents.eventType, "slide"),
            isNotNull(schema.shareLinkEvents.slideIndex),
          ),
        )
        .groupBy(schema.shareLinkEvents.slideIndex);

      const response: ShareLinkStatsResponse = {
        token,
        viewCount: Number(overall?.viewCount ?? 0),
        uniqueSessions: Number(overall?.uniqueSessions ?? 0),
        lastViewedAt: overall?.lastViewedAt ?? null,
        slides: slideRows
          .map((row) => {
            const viewers = Number(row.viewers);
            const totalDwellMs = Number(row.totalDwellMs);
            return {
              slideIndex: Number(row.slideIndex),
              viewers,
              totalDwellMs,
              avgDwellMs: viewers > 0 ? Math.round(totalDwellMs / viewers) : 0,
            };
          })
          .sort((a, b) => a.slideIndex - b.slideIndex),
      };
      return response;
    },
    session,
  );
});

/**
 * DELETE /api/share/:token
 * Revoke a snapshot link. Allowed for the user who minted it, or anyone
 * with admin access on the source deck.
 */
export const revokeShareLink = defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token");
  if (!token) {
    setResponseStatus(event, 400);
    return { error: "Token is required" };
  }

  const session = await resolveSlidesRequestAuthContext(event);
  if (!session.email) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  return withSlidesRequestContext(
    event,
    async () => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.deckShareLinks)
        .where(eq(schema.deckShareLinks.token, token))
        .limit(1);
      const link = rows[0];

      // 404 for missing AND for permission failures below, so callers
      // cannot probe which tokens exist.
      if (!link) {
        setResponseStatus(event, 404);
        return { error: "Share link not found" };
      }

      if (!(await canManageShareLink(link, session.email as string))) {
        setResponseStatus(event, 404);
        return { error: "Share link not found" };
      }

      await db
        .update(schema.deckShareLinks)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(schema.deckShareLinks.token, token));

      // Viewer analytics die with the link — the owner gave up the stats by
      // revoking, and dead tokens must not accumulate rows.
      await db
        .delete(schema.shareLinkEvents)
        .where(eq(schema.shareLinkEvents.token, token));

      return { success: true };
    },
    session,
  );
});

/**
 * Revoke every share link minted from a deck — called on deck deletion so
 * public snapshots don't outlive the deck. Analytics events for those links
 * die with them, same as a single-link revoke.
 */
export async function revokeShareLinksForDeck(deckId: string): Promise<void> {
  const db = getDb();

  // Subquery instead of select-then-delete: one round trip, and it also
  // covers links already revoked individually (whose events are gone anyway).
  await db
    .delete(schema.shareLinkEvents)
    .where(
      inArray(
        schema.shareLinkEvents.token,
        db
          .select({ token: schema.deckShareLinks.token })
          .from(schema.deckShareLinks)
          .where(eq(schema.deckShareLinks.deckId, deckId)),
      ),
    );

  await db
    .update(schema.deckShareLinks)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.deckShareLinks.deckId, deckId),
        isNull(schema.deckShareLinks.revokedAt),
      ),
    );
}
