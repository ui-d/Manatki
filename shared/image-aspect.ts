/**
 * Map a target canvas (slide/asset pixel dims) to image-provider generation
 * config. Providers only support a fixed set of aspect ratios/sizes, so we
 * snap to the nearest supported value and report how far off it is; callers
 * absorb the residual mismatch with cover-fit cropping (`object-fit: cover`).
 */
import {
  getPresetSize,
  SIZE_PRESETS,
  type SizePreset,
} from "./slide-size.js";

/** Aspect ratios accepted by Gemini's imageConfig.aspectRatio. */
export const GEMINI_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type GeminiAspectRatio = (typeof GEMINI_ASPECT_RATIOS)[number];

export type GeminiImageSize = "1K" | "2K" | "4K";

/** The only output sizes gpt-image supports. */
export const OPENAI_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type OpenAISize = (typeof OPENAI_SIZES)[number];

export interface ImageAspectPlan {
  /** Nearest Gemini-supported ratio to the target canvas. */
  aspectRatio: GeminiAspectRatio;
  /** Gemini output tier sized to cover the target's largest dimension. */
  imageSize: GeminiImageSize;
  /** Nearest OpenAI output size to the target canvas. */
  openaiSize: OpenAISize;
  /**
   * Relative gap between the target ratio and the snapped Gemini ratio
   * (0 = exact). Ultra-wide strips (e.g. 728×90 ≈ 8:1) snap to 21:9 with a
   * large mismatch — cover-fit cropping handles moderate values; treat
   * anything past ~0.15 as "expect a visible crop".
   */
  mismatch: number;
  /** Same gap measured against the snapped OpenAI size. */
  openaiMismatch: number;
}

function ratioOf(spec: string): number {
  const [w, h] = spec.split(/[:x]/).map(Number);
  return w / h;
}

/** Distance between two w/h ratios, symmetric in orientation. */
function logRatioDistance(a: number, b: number): number {
  return Math.abs(Math.log(a) - Math.log(b));
}

function nearest<T extends string>(target: number, specs: readonly T[]): T {
  let best = specs[0];
  let bestDist = Infinity;
  for (const spec of specs) {
    const dist = logRatioDistance(target, ratioOf(spec));
    if (dist < bestDist) {
      bestDist = dist;
      best = spec;
    }
  }
  return best;
}

function relativeMismatch(target: number, snapped: number): number {
  return Math.abs(snapped - target) / target;
}

/**
 * Plan provider config for a target canvas. Throws on non-positive dims —
 * validate with `isValidSlideDims` first when the dims are user-supplied.
 */
export function planImageAspect(width: number, height: number): ImageAspectPlan {
  if (!(width > 0) || !(height > 0)) {
    throw new Error(`Invalid canvas ${width}x${height}`);
  }
  const target = width / height;

  const aspectRatio = nearest(target, GEMINI_ASPECT_RATIOS);
  const openaiSize = nearest(target, OPENAI_SIZES);

  const maxDim = Math.max(width, height);
  const imageSize: GeminiImageSize =
    maxDim <= 1024 ? "1K" : maxDim <= 2048 ? "2K" : "4K";

  return {
    aspectRatio,
    imageSize,
    openaiSize,
    mismatch: relativeMismatch(target, ratioOf(aspectRatio)),
    openaiMismatch: relativeMismatch(target, ratioOf(openaiSize)),
  };
}

/** Plan for a named size preset; null when the preset id is unknown. */
export function planForPreset(preset: string): ImageAspectPlan | null {
  const size = getPresetSize(preset);
  if (!size) return null;
  return planImageAspect(size.width, size.height);
}

/**
 * Platform-chrome guidance for presets with a safe area (e.g. ig-story):
 * tells the generator to keep important elements out of the covered bands.
 * Returns "" for unknown presets or presets without a safe area.
 */
export function safeAreaPromptNote(preset?: string | null): string {
  if (!preset) return "";
  const def = SIZE_PRESETS[preset as SizePreset] as
    | (typeof SIZE_PRESETS)[SizePreset]
    | undefined;
  const safeArea =
    def && "safeArea" in def
      ? (def.safeArea as {
          top?: number;
          bottom?: number;
          left?: number;
          right?: number;
        })
      : undefined;
  if (!def || !safeArea) return "";
  const bands: string[] = [];
  if (safeArea.top) bands.push(`top ${safeArea.top}px`);
  if (safeArea.bottom) bands.push(`bottom ${safeArea.bottom}px`);
  if (safeArea.left) bands.push(`left ${safeArea.left}px`);
  if (safeArea.right) bands.push(`right ${safeArea.right}px`);
  if (bands.length === 0) return "";
  return `The ${bands.join(" and ")} of the ${def.width}×${def.height} frame are covered by platform UI — keep all important visual elements out of those bands.`;
}

/**
 * Extra prompt line for providers whose snapped output visibly deviates from
 * the target canvas — keeps the subject centered so cover-fit cropping is
 * safe. Returns "" when the snap is close enough.
 */
export function cropGuidanceLine(mismatch: number): string {
  if (mismatch <= 0.15) return "";
  return (
    "The final image will be cropped to a different aspect ratio: keep the " +
    "composition centered with generous margins; the outer edges may be cut off."
  );
}
