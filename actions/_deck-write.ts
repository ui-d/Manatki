/**
 * Shared helpers for the editor-owned deck write actions (`add-deck`,
 * `save-deck`, `delete-deck`). Underscore-prefixed so action discovery skips
 * it — this module is not itself an action.
 */
import { assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import { ASPECT_RATIO_VALUES } from "../shared/aspect-ratios.js";
import {
  DECK_KIND_VALUES,
  MAX_SLIDE_AREA,
  MAX_SLIDE_DIM,
  MIN_SLIDE_DIM,
  getPresetSize,
  isValidSlideDims,
  type SlideSize,
} from "../shared/slide-size.js";

/** A deck is stored as one opaque JSON blob in `decks.data`. */
export type DeckPayload = Record<string, unknown>;

/**
 * Actions surface HTTP status through `statusCode`; the action route echoes the
 * message verbatim for client errors and swallows it for anything >= 500.
 */
export function deckHttpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function deckTitle(deck: DeckPayload): string {
  return typeof deck.title === "string" && deck.title ? deck.title : "Untitled";
}

export function deckDesignSystemId(deck: DeckPayload): string | null {
  return typeof deck.designSystemId === "string" && deck.designSystemId
    ? deck.designSystemId
    : null;
}

export function assertValidAspectRatio(deck: DeckPayload): void {
  if (
    "aspectRatio" in deck &&
    !ASPECT_RATIO_VALUES.includes(deck.aspectRatio as never)
  ) {
    throw deckHttpError(400, "Invalid aspect ratio");
  }
}

export function assertValidKind(deck: DeckPayload): void {
  if ("kind" in deck && !DECK_KIND_VALUES.includes(deck.kind as never)) {
    throw deckHttpError(400, "Invalid project kind");
  }
}

/**
 * Resolve the agent-facing sizePreset/width/height params into a stored
 * SlideSize. Preset wins; explicit dims must come as a valid pair; neither
 * returns undefined (caller falls back to the deck default).
 */
export function resolveRequestedSlideSize(input: {
  sizePreset?: string;
  width?: number;
  height?: number;
}): SlideSize | undefined {
  if (input.sizePreset) {
    const preset = getPresetSize(input.sizePreset);
    if (!preset) {
      throw deckHttpError(400, `Unknown size preset: ${input.sizePreset}`);
    }
    return preset;
  }
  if (input.width !== undefined || input.height !== undefined) {
    if (!isValidSlideDims(input.width, input.height)) {
      throw deckHttpError(
        400,
        `width and height must be provided together as integers between ${MIN_SLIDE_DIM} and ${MAX_SLIDE_DIM} with a total area of at most ${MAX_SLIDE_AREA} pixels`,
      );
    }
    return { width: input.width!, height: input.height! };
  }
  return undefined;
}

/** The deck's default canvas for new slides in social projects. */
export function deckDefaultSize(deck: DeckPayload): SlideSize | undefined {
  const size = deck.defaultSize as SlideSize | undefined;
  return size && isValidSlideDims(size.width, size.height) ? size : undefined;
}

const dimSchema = z.number().int().min(MIN_SLIDE_DIM).max(MAX_SLIDE_DIM);

/**
 * Per-slide pixel size. Dims are always materialized; `preset` is display
 * sugar and is silently dropped when it doesn't name a known preset with
 * matching dims — a stale preset must never break a stored asset.
 */
export const SlideSizeSchema = z
  .object({
    width: dimSchema,
    height: dimSchema,
    preset: z.string().optional(),
  })
  .superRefine((size, ctx) => {
    if (size.width * size.height > MAX_SLIDE_AREA) {
      ctx.addIssue({
        code: "custom",
        message: `Slide size exceeds the maximum area of ${MAX_SLIDE_AREA} pixels`,
      });
    }
  })
  .transform((size) => {
    if (!size.preset) return { width: size.width, height: size.height };
    const preset = getPresetSize(size.preset);
    return preset &&
      preset.width === size.width &&
      preset.height === size.height
      ? size
      : { width: size.width, height: size.height };
  });

export async function assertDesignSystemReadable(
  designSystemId: string | null,
): Promise<void> {
  if (!designSystemId) return;
  try {
    await assertAccess("design-system", designSystemId, "viewer");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw deckHttpError(400, "Design system not accessible");
    }
    throw err;
  }
}
