import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { registerFileUploadProvider } from "@agent-native/core/server";
import { put } from "@vercel/blob";

import { isHostedSlidesRuntime } from "../lib/tenant-files.js";

const sanitizeFilename = (filename: string | undefined) => {
  const base = path.basename(filename || "upload");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "upload";
};

export const LOCAL_UPLOADS_DIR = path.join(
  process.cwd(),
  "data",
  "uploads-public",
);

/**
 * File storage for slide images and screenshots.
 *
 * - Hosted (Vercel): Vercel Blob via BLOB_READ_WRITE_TOKEN. Self-hosters can
 *   swap this for S3/R2 by registering their own provider here instead.
 * - Local dev: files land in data/uploads-public/ (gitignored) and are served
 *   by GET /uploads/*, so image-deck imports work with zero configuration.
 *   Never active in hosted runtimes, whose filesystem is read-only.
 */
export default function fileUploadPlugin() {
  registerFileUploadProvider({
    id: "vercel-blob",
    name: "Vercel Blob",
    isConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    upload: async (input) => {
      const filename = sanitizeFilename(input.filename);
      const scope = input.ownerEmail
        ? crypto
            .createHash("sha256")
            .update(input.ownerEmail)
            .digest("hex")
            .slice(0, 16)
        : "shared";
      const blob = await put(
        `uploads/${scope}/${filename}`,
        Buffer.from(input.data),
        {
          access: "public",
          addRandomSuffix: true,
          contentType: input.mimeType,
        },
      );
      return { url: blob.url, provider: "vercel-blob" };
    },
  });

  registerFileUploadProvider({
    id: "local-dev-disk",
    name: "Local dev disk",
    isConfigured: () =>
      !isHostedSlidesRuntime() && !process.env.BLOB_READ_WRITE_TOKEN,
    upload: async (input) => {
      const filename = sanitizeFilename(input.filename);
      const stored = `${crypto.randomBytes(6).toString("hex")}-${filename}`;
      await fs.promises.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
      await fs.promises.writeFile(
        path.join(LOCAL_UPLOADS_DIR, stored),
        Buffer.from(input.data),
      );
      return { url: `/uploads/${stored}`, provider: "local-dev-disk" };
    },
  });
}
