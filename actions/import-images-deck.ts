import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import {
  getRequestUserEmail,
  getRequestOrgId,
} from "@agent-native/core/server/request-context";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { notifyClients } from "../server/handlers/decks.js";
import { getDeckUrl } from "./_app-url.js";

const ImageSchema = z.object({
  url: z.string().min(1).describe("Hosted URL of the slide image"),
  name: z
    .string()
    .min(1)
    .describe(
      "Original filename; slides are ordered by natural sort of these names",
    ),
  screenshots: z
    .array(z.object({ url: z.string().min(1), name: z.string().min(1) }))
    .optional()
    .describe(
      "Supporting screenshots for this slide, shown as a grid in the presenter",
    ),
});

/** Full-bleed wrapper so image slides keep working in the editor, share
 * views and exports, which all render slide `content` HTML. */
const imageSlideContent = (url: string) =>
  `<div class="fmd-slide" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #0b0b0c;"><img src="${url}" alt="" style="max-width: 100%; max-height: 100%; object-fit: contain;" /></div>`;

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

export default defineAction({
  description:
    "Create a deck where every slide is a single image (e.g. an exported deck " +
    "or a folder of slide pictures). Images must already be uploaded — pass " +
    "their hosted URLs. Slides are ordered by natural filename sort; each " +
    "image's screenshots become that slide's presenter screenshot grid. " +
    "Image decks present in the two-pane presenter stage by default.",
  schema: z.object({
    title: z.string().min(1).describe("Deck title"),
    images: z.array(ImageSchema).min(1).describe("One slide per image"),
  }),
  run: async ({ title, images }) => {
    const ownerEmail = getRequestUserEmail();
    const now = new Date().toISOString();
    const id = `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const ordered = [...images].sort((a, b) => naturalCompare(a.name, b.name));
    const slides = ordered.map((image, index) => ({
      id: `slide-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
      content: imageSlideContent(image.url),
      notes: "",
      layout: "full-image" as const,
      kind: "image" as const,
      imageUrl: image.url,
      screenshots: (image.screenshots ?? [])
        .slice()
        .sort((a, b) => naturalCompare(a.name, b.name))
        .map((shot) => shot.url),
    }));

    const db = getDb();
    const data = { title, slides, createdAt: now, updatedAt: now };
    await db.insert(schema.decks).values({
      id,
      title,
      data: JSON.stringify(data),
      ownerEmail,
      orgId: getRequestOrgId(),
      createdAt: now,
      updatedAt: now,
    });

    notifyClients(id);
    await writeAppState("refresh-signal", {
      ts: now,
      source: "import-images-deck",
    });

    return {
      id,
      title,
      slideCount: slides.length,
      screenshotCount: slides.reduce(
        (total, slide) => total + slide.screenshots.length,
        0,
      ),
      url: getDeckUrl(id),
      presentUrl: `${getDeckUrl(id)}/present?mode=stage`,
    };
  },
});
