/**
 * Server-side slide-content hygiene for blob writes (H1).
 *
 * Two jobs, in order:
 * 1. Rewrite large inline `data:image/...` URIs to hosted URLs via the file
 *    provider — base64 payloads must not land in `decks.data`.
 * 2. Enforce the persisted-content byte cap. Runs AFTER the rewrite so a
 *    pasted image that uploads cleanly never trips the cap.
 *
 * Rewrite failures are non-fatal per URI (kept inline); the byte cap is the
 * backstop that keeps a failed upload from turning into a megabyte SQL row.
 */
import { getRequestUserEmail } from "@agent-native/core/server/request-context";

import {
  INLINE_IMAGE_REWRITE_THRESHOLD_CHARS,
  MAX_SLIDE_CONTENT_BYTES,
  utf8ByteLength,
} from "../shared/slide-content-limits.js";
import { uploadImageAsset } from "../server/handlers/assets.js";

const DATA_URI_RE = /data:image\/(?:gif|png|jpe?g|webp|avif);base64,[A-Za-z0-9+/=]+/g;

const EXT_BY_MIME: Record<string, string> = {
  "image/gif": "gif",
  "image/png": "png",
  "image/jpg": "jpg",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function slideContentTooLargeError(bytes: number): Error {
  return Object.assign(
    new Error(
      `Slide content is ${Math.round(bytes / 1024)} KB — the persisted limit is ` +
        `${Math.round(MAX_SLIDE_CONTENT_BYTES / 1024)} KB. Host large images as ` +
        `URLs instead of inline data: URIs.`,
    ),
    { statusCode: 413 },
  );
}

export function assertSlideContentWithinCap(content: string): void {
  const bytes = utf8ByteLength(content);
  if (bytes > MAX_SLIDE_CONTENT_BYTES) {
    throw slideContentTooLargeError(bytes);
  }
}

/** Unique inline image URIs above the rewrite threshold, in order found. */
export function findLargeInlineImages(content: string): string[] {
  if (!content.includes("data:image/")) return [];
  const unique = new Set<string>();
  for (const match of content.matchAll(DATA_URI_RE)) {
    if (match[0].length > INLINE_IMAGE_REWRITE_THRESHOLD_CHARS) {
      unique.add(match[0]);
    }
  }
  return [...unique];
}

export async function rewriteInlineImagesToHostedUrls(
  content: string,
): Promise<string> {
  const uris = findLargeInlineImages(content);
  if (uris.length === 0) return content;

  const email = getRequestUserEmail();
  if (!email) return content; // no uploader identity — cap is the backstop

  let result = content;
  for (const uri of uris) {
    try {
      const commaIdx = uri.indexOf(",");
      const mime = uri.slice(5, uri.indexOf(";"));
      const ext = EXT_BY_MIME[mime] ?? "png";
      const data = Buffer.from(uri.slice(commaIdx + 1), "base64");
      const { url } = await uploadImageAsset({
        email,
        originalName: `inline-image.${ext}`,
        data,
        type: mime,
      });
      result = result.split(uri).join(url);
    } catch (err) {
      console.warn(
        "[slide-content] inline image upload failed, keeping data URI:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}

/** Rewrite inline images, then enforce the persisted byte cap. */
export async function prepareSlideContentForPersist(
  content: string,
): Promise<string> {
  const rewritten = await rewriteInlineImagesToHostedUrls(content);
  assertSlideContentWithinCap(rewritten);
  return rewritten;
}
