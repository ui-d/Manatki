/**
 * Agent-triggered PNG export transport — shared shapes for the
 * `export-asset-images` action (server) and `PngExportListener` (editor).
 *
 * Rasterization needs a live DOM, so the action cannot render PNGs itself.
 * It writes a one-shot request into application state, an open editor tab
 * picks it up, renders the slides offscreen, uploads the PNGs, and writes
 * the result back — the same open-editor round-trip `_await-fit-check` uses.
 */

export const PNG_EXPORT_REQUEST_KEY = "png-export-request";
export const PNG_EXPORT_RESULT_KEY = "png-export-result";

export interface PngExportRequest {
  requestId: string;
  deckId: string;
  /** Slide ids to export; null exports every slide. */
  slideIds: string[] | null;
  /** Raster scale multiplier over the intrinsic canvas size. */
  scale: number;
  requestedAt: number;
}

export interface PngExportedImage {
  slideId: string;
  /** 1-based position in the deck at export time. */
  slideNumber: number;
  /** Hosted URL — never a data: URL. */
  url: string;
  width: number;
  height: number;
}

export interface PngExportResult {
  requestId: string;
  deckId: string;
  status: "done" | "error";
  images: PngExportedImage[];
  error?: string;
  completedAt: number;
}

export function isPngExportRequest(
  value: unknown,
): value is PngExportRequest {
  const v = value as PngExportRequest | null;
  return (
    !!v &&
    typeof v.requestId === "string" &&
    typeof v.deckId === "string" &&
    typeof v.scale === "number" &&
    (v.slideIds === null || Array.isArray(v.slideIds))
  );
}

export function isPngExportResult(value: unknown): value is PngExportResult {
  const v = value as PngExportResult | null;
  return (
    !!v &&
    typeof v.requestId === "string" &&
    (v.status === "done" || v.status === "error") &&
    Array.isArray(v.images)
  );
}
