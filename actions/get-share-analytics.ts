/**
 * get-share-analytics — viewer analytics for a deck's snapshot share links.
 *
 * Read-only companion to the Snapshot-link tab: every active link with view
 * counts, unique viewer sessions, last-viewed time, and per-slide engagement
 * (viewers + total/average dwell). All data is anonymous by design — events
 * carry only client-minted random session ids, never viewer identity.
 */
import { defineAction } from "@agent-native/core";
import { assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import { collectShareAnalyticsForDeck } from "../server/handlers/share.js";
import { deckHttpError } from "./_deck-write.js";

export default defineAction({
  description:
    "Get viewer analytics for a deck's public snapshot share links: view " +
    "counts, unique anonymous viewer sessions, last-viewed time, and " +
    "per-slide engagement (viewers, total and average dwell in ms, keyed " +
    "by slideIndex). Only covers active links; revoked links delete their " +
    "analytics. Viewer identity is never available — sessions are " +
    "anonymous by design.",
  schema: z.object({
    deckId: z.string().min(1).describe("Deck ID"),
  }),
  http: { method: "GET" },
  run: async ({ deckId }) => {
    try {
      // Same bar as listing or minting links: admin on the source deck.
      // 404 rather than 403 so callers can't probe for decks they can't see.
      await assertAccess("deck", deckId, "admin");
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw deckHttpError(404, "Deck not found");
      }
      throw err;
    }
    return await collectShareAnalyticsForDeck(deckId);
  },
});
