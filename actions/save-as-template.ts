/**
 * save-as-template — snapshot a deck (or a subset of its slides) as a
 * reusable template.
 *
 * Templates are ordinary decks with `isTemplate: true` + `templateMeta` in
 * the JSON blob, so they inherit sharing, versioning, previews, and kind for
 * free. Copy stays as a real exemplar — layouts are tuned to real headline
 * lengths, and instantiation replaces content anyway (see
 * create-from-template). Ask the agent to "genericize" a template if
 * bracketed placeholders are explicitly wanted.
 */
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
    "Save a deck or social project (optionally only some of its slides) as " +
    "a reusable template. The template appears under the library's " +
    "Templates filter and can be instantiated with create-from-template. " +
    "Content is kept as-is — it documents the intended use of each layout.",
  schema: z.object({
    deckId: z.string().describe("Source deck / social project ID"),
    title: z
      .string()
      .optional()
      .describe("Template title (defaults to '<source title> — Template')"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("Short description shown on the template card"),
    slideIds: z
      .array(z.string())
      .optional()
      .describe(
        "Save only these slide ids (e.g. a single banner as a one-asset template); omit for the whole deck",
      ),
  }),
  run: async ({ deckId, title, description, slideIds }) => {
    const access = await resolveAccess("deck", deckId);
    if (!access) {
      throw Object.assign(new Error("Deck not found"), { statusCode: 404 });
    }

    const source = access.resource;
    const now = new Date().toISOString();
    const newId = `deck-${nanoid()}`;
    const newTitle = title || `${source.title} — Template`;

    const data = copyDeckData(JSON.parse(source.data), {
      title: newTitle,
      now,
      slideIds,
    });
    data.isTemplate = true;
    data.templateMeta = {
      ...(description ? { description } : {}),
      sourceDeckId: deckId,
      savedAt: now,
    };
    data.designSystemId = source.designSystemId ?? data.designSystemId;

    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) throw new Error("no authenticated user");

    await getDb().insert(schema.decks).values({
      id: newId,
      title: newTitle,
      data: JSON.stringify(data),
      designSystemId: source.designSystemId ?? null,
      createdAt: now,
      updatedAt: now,
      ownerEmail,
      orgId: getRequestOrgId() || null,
    });

    return {
      id: newId,
      title: newTitle,
      isTemplate: true,
      slideCount: Array.isArray(data.slides) ? data.slides.length : 0,
      url: getDeckUrl(newId),
    };
  },
});
