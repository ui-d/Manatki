/**
 * Shared deep-copy core for deck duplication flows (duplicate-deck,
 * save-as-template, create-from-template). Pure: returns a new data object,
 * never mutates the source. Slide ids are regenerated so edits to the copy
 * can't collide with the source; `previewUrl` is intentionally NOT part of a
 * copy — preview blobs are GC'd per deck and must never be shared.
 */
import { nanoid } from "nanoid";

export interface CopyDeckOptions {
  title: string;
  /** ISO timestamp stamped as createdAt/updatedAt on the copy. */
  now: string;
  /** Copy only these slide ids (e.g. one asset as a template). */
  slideIds?: string[];
}

export function copyDeckData(
  sourceData: Record<string, unknown>,
  options: CopyDeckOptions,
): Record<string, unknown> {
  const data = structuredClone(sourceData) as Record<string, unknown> & {
    slides?: Array<{ id?: string }>;
  };
  let slides = Array.isArray(data.slides) ? data.slides : [];

  if (options.slideIds?.length) {
    const known = new Set(slides.map((slide) => slide.id));
    const missing = options.slideIds.filter((id) => !known.has(id));
    if (missing.length) {
      throw new Error(
        `Slide id(s) not found: ${missing.join(", ")}. Use get-deck to list slide ids.`,
      );
    }
    const wanted = new Set(options.slideIds);
    slides = slides.filter((slide) => wanted.has(slide.id as string));
  }

  for (const slide of slides) {
    slide.id = `slide-${nanoid(8)}`;
  }

  data.slides = slides;
  data.title = options.title;
  data.createdAt = options.now;
  data.updatedAt = options.now;
  return data;
}
