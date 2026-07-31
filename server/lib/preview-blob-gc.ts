/**
 * Garbage collection for deck preview-thumbnail blobs.
 *
 * Every preview regeneration uploads a new file (random-suffixed key) and the
 * old one used to live forever. Deletion is deliberately conservative: a
 * caller could pass any hosted URL through set-deck-preview, so we only
 * delete blobs that sit under OUR `uploads/` prefix AND inside the storage
 * scope of an email we trust for this deck (its owner or the caller). URLs
 * that don't match are skipped, never errored — an orphaned blob is cheaper
 * than deleting someone else's file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { LOCAL_UPLOADS_DIR } from "../plugins/file-upload.js";

/** Mirrors the per-owner scope segment minted in plugins/file-upload.ts. */
function scopeHash(email: string): string {
  return crypto.createHash("sha256").update(email).digest("hex").slice(0, 16);
}

export type PreviewBlobGcResult = "deleted" | "skipped";

export async function deletePreviewBlob(
  url: string,
  trustedEmails: Array<string | null | undefined>,
): Promise<PreviewBlobGcResult> {
  try {
    if (url.startsWith("/uploads/")) {
      // Local-dev disk provider. basename() drops any traversal segments.
      const name = path.basename(url);
      if (!name || name === "uploads") return "skipped";
      await fs.promises.unlink(path.join(LOCAL_UPLOADS_DIR, name));
      return "deleted";
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) return "skipped";
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
      return "skipped";
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] !== "uploads" || !segments[1]) return "skipped";
    const trusted = new Set(
      trustedEmails
        .filter((email): email is string => Boolean(email))
        .map(scopeHash),
    );
    if (!trusted.has(segments[1])) return "skipped";

    const { del } = await import("@vercel/blob");
    await del(url);
    return "deleted";
  } catch (err) {
    // Missing file, revoked token, transient provider error — all non-fatal.
    console.warn(
      "[preview-gc] blob delete skipped:",
      err instanceof Error ? err.message : err,
    );
    return "skipped";
  }
}
