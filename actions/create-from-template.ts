/**
 * create-from-template — instantiate a working deck/social project from a
 * saved template. Mechanical copy only: layouts, structure, and content come
 * across verbatim (with fresh slide ids) and the template flag is stripped.
 * Rebranding the copy for a new topic is the agent's job — the returned
 * agentContext says exactly what to do.
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
import { resolveDefaultDesignSystemId } from "../server/workspace-defaults.js";
import { getDeckUrl } from "./_app-url.js";
import { copyDeckData } from "./_deck-copy.js";

export default defineAction({
  description:
    "Create a new deck / social project from a saved template (see " +
    "list-decks with templates:'only'). Copies every slide with fresh ids, " +
    "links a design system, and strips the template flag. Fill the copy in " +
    "afterwards: keep every layout and structure, replace copy/imagery with " +
    "the user's content, then run lint-deck-brand.",
  schema: z.object({
    templateId: z.string().describe("Template deck ID (isTemplate: true)"),
    title: z
      .string()
      .optional()
      .describe("Title for the new deck (defaults to the template title)"),
    newId: z
      .string()
      .optional()
      .describe(
        "Optional client-supplied id so the UI can navigate optimistically",
      ),
    designSystemId: z
      .string()
      .optional()
      .describe(
        "Design system to link (defaults to the template's, then the workspace default)",
      ),
  }),
  run: async ({ templateId, title, newId: clientNewId, designSystemId }) => {
    const access = await resolveAccess("deck", templateId);
    const sourceData = access
      ? (JSON.parse(access.resource.data) as Record<string, unknown>)
      : null;
    if (!access || sourceData?.isTemplate !== true) {
      // Missing and non-template ids fail identically so callers can't
      // probe for decks they can't see.
      throw Object.assign(new Error("Template not found"), {
        statusCode: 404,
      });
    }

    const source = access.resource;
    const now = new Date().toISOString();
    const newId = clientNewId || `deck-${nanoid()}`;
    const newTitle =
      title || String(source.title).replace(/\s+—\s+Template$/u, "");

    const data = copyDeckData(sourceData!, { title: newTitle, now });
    delete data.isTemplate;
    delete data.templateMeta;

    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) throw new Error("no authenticated user");

    let linkedSystemId =
      source.designSystemId ??
      (typeof data.designSystemId === "string" ? data.designSystemId : null);
    if (designSystemId) {
      const systemAccess = await resolveAccess("design-system", designSystemId);
      if (!systemAccess) {
        throw Object.assign(new Error("Design system not found"), {
          statusCode: 404,
        });
      }
      linkedSystemId = designSystemId;
    }
    if (!linkedSystemId) {
      linkedSystemId = await resolveDefaultDesignSystemId(ownerEmail);
    }
    data.designSystemId = linkedSystemId ?? undefined;

    await getDb().insert(schema.decks).values({
      id: newId,
      title: newTitle,
      data: JSON.stringify(data),
      designSystemId: linkedSystemId ?? null,
      createdAt: now,
      updatedAt: now,
      ownerEmail,
      orgId: getRequestOrgId() || null,
    });

    const slideCount = Array.isArray(data.slides) ? data.slides.length : 0;
    return {
      id: newId,
      title: newTitle,
      slideCount,
      url: getDeckUrl(newId),
      agentContext:
        `This ${data.kind === "social" ? "social project" : "deck"} was instantiated from template "${source.title}" (${templateId}). ` +
        "When filling it in for the user: keep every layout, type scale, and slide structure exactly as-is; " +
        "replace all copy and imagery with the user's content via targeted update-slide edits; " +
        "then run lint-deck-brand and fix findings.",
    };
  },
});
