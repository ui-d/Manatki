/**
 * delete-deck — remove a deck and its version history.
 *
 * Hidden from the agent: deck deletion has always been a UI-only operation and
 * this action exists to give the editor the same permission rule it had on the
 * route it replaced.
 */
import { defineAction } from "@agent-native/core";
import { assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getRequestUserEmail } from "@agent-native/core/server/request-context";

import { getDb, schema } from "../server/db/index.js";
import { notifyClients } from "../server/handlers/decks.js";
import { revokeShareLinksForDeck } from "../server/handlers/share.js";
import { deletePreviewBlob } from "../server/lib/preview-blob-gc.js";
import { deckHttpError } from "./_deck-write.js";

export default defineAction({
  description: "Delete a deck and its saved versions.",
  schema: z.object({
    id: z.string().min(1).describe("Deck ID"),
  }),
  http: { method: "DELETE" },
  agentTool: false,
  run: async ({ id }) => {
    try {
      // assertAccess loads the row and verifies the caller has admin role on
      // this resource — it must run BEFORE the delete so we don't leak
      // existence to callers who lack access.
      const access = await assertAccess("deck", id, "admin");
      const db = getDb();
      await db
        .delete(schema.deckVersions)
        .where(
          and(
            eq(schema.deckVersions.deckId, id),
            eq(
              schema.deckVersions.ownerEmail,
              access.resource.ownerEmail as string,
            ),
          ),
        );
      const result = await db
        .delete(schema.decks)
        .where(eq(schema.decks.id, id))
        .returning();

      if (result.length === 0) {
        throw deckHttpError(404, "Deck not found");
      }
      // Public snapshot links must not outlive the deck. Failure here is
      // non-fatal (links still expire via TTL) but logged for follow-up.
      try {
        await revokeShareLinksForDeck(id);
      } catch (err) {
        console.warn(
          "[delete-deck] failed to revoke share links:",
          err instanceof Error ? err.message : err,
        );
      }
      // GC the preview thumbnail blob; fire-and-forget, an orphan is fine.
      const previewUrl = (access.resource.previewUrl as string | null) ?? null;
      if (previewUrl) {
        void deletePreviewBlob(previewUrl, [
          access.resource.ownerEmail as string,
          getRequestUserEmail(),
        ]);
      }
      // The row is already gone, so scoped delivery cannot look up the
      // audience — pass it from the pre-delete access check.
      notifyClients(id, {
        type: "deck-deleted",
        audience: {
          ownerEmail: access.resource.ownerEmail as string,
          orgId: (access.resource.orgId as string | null) ?? null,
          visibility: (access.resource.visibility as string | null) ?? null,
        },
      });
      return { success: true };
    } catch (err) {
      // 404 rather than 403 so callers can't probe for decks they can't see.
      if (err instanceof ForbiddenError) {
        throw deckHttpError(404, "Deck not found");
      }
      throw err;
    }
  },
});
