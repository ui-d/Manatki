import crypto from "crypto";

import { readBody } from "@agent-native/core/server";
import { assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { toSharedDeckSlide } from "@shared/api";
import type {
  ShareDeckRequest,
  ShareDeckResponse,
  ShareLinkSummary,
  SharedDeckResponse,
} from "@shared/api";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import {
  defineEventHandler,
  getQuery,
  getRouterParam,
  setResponseStatus,
} from "h3";

import { getDb, schema } from "../db";
import {
  resolveSlidesRequestAuthContext,
  withSlidesRequestContext,
} from "./request-auth-context.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

async function createShareLink(
  event: any,
  deckId: string,
  ownerEmail: string,
) {
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

  // Prune expired rows opportunistically (no await — background)
  db.delete(schema.deckShareLinks)
    .where(
      lt(
        schema.deckShareLinks.createdAt,
        new Date(Date.now() - THIRTY_DAYS_MS).toISOString(),
      ),
    )
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
    return { error: "Shared presentation not found or has expired" };
  }

  // Revoked links 404 identically to missing ones so a revoked token leaks
  // nothing about whether it ever existed.
  if (shared.revokedAt) {
    setResponseStatus(event, 404);
    return { error: "Shared presentation not found or has expired" };
  }

  // Check expiry
  const age = Date.now() - new Date(shared.createdAt).getTime();
  if (age > THIRTY_DAYS_MS) {
    setResponseStatus(event, 404);
    return { error: "Shared presentation not found or has expired" };
  }

  // Legacy rows store a bare slide array; newer rows wrap it in an
  // envelope that also carries the project kind.
  const parsed = JSON.parse(shared.slides);
  const isEnvelope = !Array.isArray(parsed) && parsed && typeof parsed === "object";
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

      const links: ShareLinkSummary[] = rows;
      return { links };
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

      let allowed = link.ownerEmail === session.email;
      if (!allowed && link.deckId) {
        try {
          await assertAccess("deck", link.deckId, "admin");
          allowed = true;
        } catch (err) {
          if (!(err instanceof ForbiddenError)) throw err;
        }
      }
      if (!allowed) {
        setResponseStatus(event, 404);
        return { error: "Share link not found" };
      }

      await db
        .update(schema.deckShareLinks)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(schema.deckShareLinks.token, token));

      return { success: true };
    },
    session,
  );
});

/**
 * Revoke every share link minted from a deck — called on deck deletion so
 * public snapshots don't outlive the deck.
 */
export async function revokeShareLinksForDeck(deckId: string): Promise<void> {
  const db = getDb();
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
