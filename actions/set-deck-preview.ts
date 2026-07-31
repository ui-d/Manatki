/**
 * set-deck-preview — store the hosted URL of a deck's rasterized first-slide
 * thumbnail. Written by the editor's preview generator (usePreviewThumbnail);
 * the library grid renders this image instead of a live slide DOM.
 *
 * Column-only write (no decks.data read-modify-write), so it does not need
 * the rev compare-and-swap.
 */
import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

function isHostedUrl(value: string): boolean {
  // Hosted URLs only — never data: payloads into SQL.
  return (
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("/")
  );
}

export default defineAction({
  description:
    "Internal editor helper: store the hosted preview-thumbnail URL for a deck.",
  agentTool: false,
  schema: z.object({
    deckId: z.string().min(1).describe("Deck ID"),
    previewUrl: z
      .string()
      .min(1)
      .max(2048)
      .nullable()
      .describe("Hosted preview image URL, or null to clear"),
  }),
  run: async ({ deckId, previewUrl }) => {
    await assertAccess("deck", deckId, "editor");
    if (previewUrl !== null && !isHostedUrl(previewUrl)) {
      throw Object.assign(
        new Error("previewUrl must be a hosted URL, not inline data"),
        { statusCode: 400 },
      );
    }

    const db = getDb();
    await db
      .update(schema.decks)
      .set({ previewUrl })
      .where(eq(schema.decks.id, deckId));

    return { ok: true, deckId };
  },
});
