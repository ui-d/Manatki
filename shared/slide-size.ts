/**
 * Per-slide (per-asset) pixel dimensions for multi-format projects.
 *
 * A slide may carry an explicit `size` ({ width, height, preset? }) that
 * overrides the deck-level aspect ratio. Resolution order everywhere:
 * slide.size → deck aspectRatio → 16:9 default. Existing decks have no
 * `size` fields, so they render exactly as before.
 */
import { getAspectRatioDims, type AspectRatio } from "./aspect-ratios.js";

export interface SlideSize {
  width: number;
  height: number;
  /** Display sugar only — dims are always materialized. */
  preset?: string;
}

export type DeckKind = "deck" | "social";
export const DECK_KIND_VALUES = ["deck", "social"] as const;

/** Bounds enforced at every write path. */
export const MIN_SLIDE_DIM = 50;
export const MAX_SLIDE_DIM = 4000;
/** 3840×2160 (4K UHD) — generous ceiling for any social/banner canvas. */
export const MAX_SLIDE_AREA = 8_294_400;

export const SIZE_PRESETS = {
  "ig-square": { width: 1080, height: 1080, label: "Instagram square (1:1)" },
  "ig-portrait": {
    width: 1080,
    height: 1350,
    label: "Instagram portrait (4:5)",
  },
  "ig-story": { width: 1080, height: 1920, label: "Story / Reel (9:16)" },
  "og-banner": { width: 1200, height: 628, label: "Link preview / OG image" },
  "x-post": { width: 1600, height: 900, label: "X / Twitter post (16:9)" },
  "linkedin-banner": { width: 1584, height: 396, label: "LinkedIn banner" },
} as const;

export type SizePreset = keyof typeof SIZE_PRESETS;
export const SIZE_PRESET_VALUES = Object.keys(SIZE_PRESETS) as [
  SizePreset,
  ...SizePreset[],
];

export function getPresetSize(preset: string): SlideSize | null {
  if (Object.prototype.hasOwnProperty.call(SIZE_PRESETS, preset)) {
    const entry = SIZE_PRESETS[preset as SizePreset];
    return { width: entry.width, height: entry.height, preset };
  }
  return null;
}

export function isValidSlideDims(width: unknown, height: unknown): boolean {
  return (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= MIN_SLIDE_DIM &&
    width <= MAX_SLIDE_DIM &&
    height >= MIN_SLIDE_DIM &&
    height <= MAX_SLIDE_DIM &&
    width * height <= MAX_SLIDE_AREA
  );
}

/**
 * Resolve the pixel canvas for a slide: explicit slide.size when valid,
 * otherwise the deck-level aspect ratio, otherwise the 16:9 default.
 */
export function getSlideDims(
  slide: { size?: SlideSize | null } | undefined | null,
  deckRatio?: AspectRatio | null,
): { width: number; height: number } {
  const size = slide?.size;
  if (size && isValidSlideDims(size.width, size.height)) {
    return { width: size.width, height: size.height };
  }
  const dims = getAspectRatioDims(deckRatio ?? undefined);
  return { width: dims.width, height: dims.height };
}

/**
 * True when every slide resolves to the same canvas — required for
 * uniform-page exports (PPTX, Google Slides) and the presenter.
 */
export function isUniformSize(
  slides: ReadonlyArray<{ size?: SlideSize | null }>,
  deckRatio?: AspectRatio | null,
): boolean {
  if (slides.length <= 1) return true;
  const first = getSlideDims(slides[0], deckRatio);
  return slides.every((slide) => {
    const dims = getSlideDims(slide, deckRatio);
    return dims.width === first.width && dims.height === first.height;
  });
}
