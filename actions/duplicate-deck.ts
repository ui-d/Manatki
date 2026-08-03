import { defineAction } from "@agent-native/core";
import {
  getRequestUserEmail,
  getRequestOrgId,
} from "@agent-native/core/server/request-context";
import { resolveAccess } from "@agent-native/core/sharing";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getDeckUrl } from "./_app-url.js";
import { copyDeckData } from "./_deck-copy.js";

export default defineAction({
  description:
    "Duplicate an existing deck, creating a new copy with a new ID. " +
    "Generates new IDs for all slides in the copy. Returns the new deck's ID, title, and slide count.",
  schema: z.object({
    deckId: z.string().describe("Source deck ID to duplicate"),
    title: z
      .string()
      .optional()
      .describe("Title for the copy (defaults to 'Copy of ...')"),
    newId: z
      .string()
      .optional()
      .describe(
        "Optional client-supplied id for the new deck. Lets the UI pick the id ahead of time so it can navigate optimistically before the server responds.",
      ),
  }),
  run: async ({ deckId, title, newId: clientNewId }) => {
    const access = await resolveAccess("deck", deckId);
    if (!access) throw new Error(`Deck not found: ${deckId}`);

    const source = access.resource;
    const db = getDb();
    const newId = clientNewId || `deck-${nanoid()}`;
    const now = new Date().toISOString();

    const newTitle = title || `Copy of ${source.title}`;
    const deckData = copyDeckData(JSON.parse(source.data), {
      title: newTitle,
      now,
    });
    deckData.designSystemId = source.designSystemId ?? deckData.designSystemId;

    await db.insert(schema.decks).values({
      id: newId,
      title: newTitle,
      data: JSON.stringify(deckData),
      designSystemId: source.designSystemId ?? null,
      createdAt: now,
      updatedAt: now,
      ownerEmail: (() => {
        const e = getRequestUserEmail();
        if (!e) throw new Error("no authenticated user");
        return e;
      })(),
      orgId: getRequestOrgId() || null,
    });

    return {
      id: newId,
      title: newTitle,
      slideCount: Array.isArray(deckData.slides) ? deckData.slides.length : 0,
      url: getDeckUrl(newId),
    };
  },
});
