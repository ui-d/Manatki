/**
 * Byte/size budgets for deck blob writes (H1). Every path that persists
 * slide HTML into `decks.data` enforces these — SQL rows must stay small and
 * blob-free (images belong in file storage, referenced by URL).
 */

/** Hard cap on persisted slide HTML, AFTER inline images are rewritten. */
export const MAX_SLIDE_CONTENT_BYTES = 300_000;

/**
 * Schema-level cap on incoming content, BEFORE inline-image rewrite. More
 * generous than the persist cap so a pasted image (~1.3× base64 overhead)
 * can still arrive, get uploaded to file storage, and be rewritten to a URL.
 */
export const MAX_SLIDE_CONTENT_INPUT_CHARS = 2_000_000;

export const MAX_SLIDE_NOTES_CHARS = 20_000;
export const MAX_SLIDE_BACKGROUND_CHARS = 10_000;
export const MAX_SLIDE_IMAGE_URL_CHARS = 2_048;
export const MAX_SLIDE_IMAGE_PROMPT_CHARS = 10_000;
export const MAX_SLIDE_EXCALIDRAW_CHARS = 2_000_000;
export const MAX_SLIDE_ANIMATIONS = 200;
export const MAX_SLIDE_SCREENSHOTS = 24;
export const MAX_DECK_TITLE_CHARS = 500;

/** Whole-deck payload ceiling for full-JSON writes (save-deck, imports). */
export const MAX_DECK_PAYLOAD_BYTES = 10_000_000;

/** Inline data: images at or below this stay inline (icons, tiny dots). */
export const INLINE_IMAGE_REWRITE_THRESHOLD_CHARS = 4_096;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
