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

/** Picker grouping bucket. Labels come from `editorToolbar.sizeCategory*`. */
export type SizePresetCategory =
  | "posts"
  | "vertical"
  | "banners"
  | "web"
  | "ads";

/** Ordered category list for grouped preset rendering. */
export const SIZE_PRESET_CATEGORIES: readonly SizePresetCategory[] = [
  "posts",
  "vertical",
  "banners",
  "web",
  "ads",
];

/**
 * Layout family used by the create-social-assets skill: presets sharing an
 * archetype share one HTML template shape and type-scale baseline.
 *  - stack: square/portrait stacked composition (1080-wide class canvas)
 *  - story: tall 9:16 with platform chrome — respect `safeArea`
 *  - split: landscape side-by-side composition
 *  - strip: ultra-wide single-row banner
 *  - micro: small ad/embed canvas with compact type
 */
export type SizePresetArchetype =
  | "stack"
  | "story"
  | "split"
  | "strip"
  | "micro";

/** Platform chrome overlay margins in canvas pixels (keep content out). */
export interface SizePresetSafeArea {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

interface SizePresetDef {
  width: number;
  height: number;
  /** Default English label; the picker prefers `sizePresets.<id>` i18n keys. */
  label: string;
  category: SizePresetCategory;
  archetype: SizePresetArchetype;
  safeArea?: SizePresetSafeArea;
}

// Entry order = display order inside each category group.
export const SIZE_PRESETS = {
  // Posts
  "ig-square": {
    width: 1080,
    height: 1080,
    label: "Instagram square (1:1)",
    category: "posts",
    archetype: "stack",
  },
  "ig-portrait": {
    width: 1080,
    height: 1350,
    label: "Instagram portrait (4:5)",
    category: "posts",
    archetype: "stack",
  },
  "fb-post": {
    width: 1200,
    height: 630,
    label: "Facebook post (1.91:1)",
    category: "posts",
    archetype: "split",
  },
  "x-post": {
    width: 1600,
    height: 900,
    label: "X / Twitter post (16:9)",
    category: "posts",
    archetype: "split",
  },
  // Vertical
  "ig-story": {
    width: 1080,
    height: 1920,
    label: "Story / Reel / TikTok (9:16)",
    category: "vertical",
    archetype: "story",
    safeArea: { top: 220, bottom: 280 },
  },
  "pinterest-pin": {
    width: 1000,
    height: 1500,
    label: "Pinterest pin (2:3)",
    category: "vertical",
    archetype: "stack",
  },
  // Banners & covers
  "linkedin-banner": {
    width: 1584,
    height: 396,
    label: "LinkedIn banner",
    category: "banners",
    archetype: "strip",
  },
  "x-header": {
    width: 1500,
    height: 500,
    label: "X / Twitter header",
    category: "banners",
    archetype: "strip",
  },
  "fb-cover": {
    width: 1640,
    height: 624,
    label: "Facebook cover",
    category: "banners",
    archetype: "strip",
  },
  "email-header": {
    width: 600,
    height: 200,
    label: "Email header",
    category: "banners",
    archetype: "strip",
  },
  // Web & video
  "og-banner": {
    width: 1200,
    height: 628,
    label: "Link preview / OG image",
    category: "web",
    archetype: "split",
  },
  "yt-thumbnail": {
    width: 1280,
    height: 720,
    label: "YouTube thumbnail (16:9)",
    category: "web",
    archetype: "split",
  },
  // Display ads
  "ad-mrec": {
    width: 300,
    height: 250,
    label: "Ad — medium rectangle (300×250)",
    category: "ads",
    archetype: "micro",
  },
  "ad-half-page": {
    width: 300,
    height: 600,
    label: "Ad — half page (300×600)",
    category: "ads",
    archetype: "micro",
  },
  "ad-leaderboard": {
    width: 728,
    height: 90,
    label: "Ad — leaderboard (728×90)",
    category: "ads",
    archetype: "micro",
  },
} as const satisfies Record<string, SizePresetDef>;

export type SizePreset = keyof typeof SIZE_PRESETS;
export const SIZE_PRESET_VALUES = Object.keys(SIZE_PRESETS) as [
  SizePreset,
  ...SizePreset[],
];

/** Preset ids of one category, in table order — for grouped pickers. */
export function presetsInCategory(
  category: SizePresetCategory,
): SizePreset[] {
  return SIZE_PRESET_VALUES.filter(
    (key) => SIZE_PRESETS[key].category === category,
  );
}

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
