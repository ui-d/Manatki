import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { notifyClients } from "../server/handlers/decks.js";
import { withDeckLock } from "./patch-deck.js";

export default defineAction({
  description:
    "Attach, append or clear a slide's presenter screenshots — the supporting " +
    "images shown as a grid beside the slide in the two-pane presenter, with " +
    "click-to-magnify. Screenshots must already be hosted URLs (upload files " +
    "first, e.g. via upload-image). mode 'replace' overwrites the list, " +
    "'append' adds to it; pass an empty list with 'replace' to clear.",
  schema: z.object({
    deckId: z.string().describe("Deck ID"),
    slideId: z.string().describe("Slide ID"),
    screenshots: z
      .array(z.string().min(1))
      .describe("Hosted screenshot URLs, in display order"),
    mode: z
      .enum(["replace", "append"])
      .optional()
      .describe("replace (default) or append"),
  }),
  run: async ({ deckId, slideId, screenshots, mode }) => {
    await assertAccess("deck", deckId, "editor");

    return withDeckLock(deckId, async () => {
      const db = getDb();
      const [row] = await db
        .select()
        .from(schema.decks)
        .where(eq(schema.decks.id, deckId))
        .limit(1);
      if (!row) throw new Error(`Deck ${deckId} not found`);

      const deck = JSON.parse(row.data) as {
        slides?: { id: string; screenshots?: string[] }[];
        updatedAt?: string;
      };
      const slide = deck.slides?.find((s) => s.id === slideId);
      if (!slide) throw new Error(`Slide ${slideId} not found in ${deckId}`);

      const previous = slide.screenshots ?? [];
      slide.screenshots =
        mode === "append" ? [...previous, ...screenshots] : screenshots;
      const now = new Date().toISOString();
      deck.updatedAt = now;

      await db
        .update(schema.decks)
        .set({ data: JSON.stringify(deck), updatedAt: now })
        .where(eq(schema.decks.id, deckId));
      notifyClients(deckId);

      return {
        deckId,
        slideId,
        screenshotCount: slide.screenshots.length,
        // Inverse op for undo: replaying replace with the previous list
        // restores the prior state exactly.
        inverse: { deckId, slideId, screenshots: previous, mode: "replace" },
      };
    });
  },
});
