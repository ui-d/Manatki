import fs from "node:fs";
import path from "node:path";

import {
  defineEventHandler,
  getRouterParam,
  setResponseHeader,
  setResponseStatus,
} from "h3";

import { LOCAL_UPLOADS_DIR } from "../../plugins/file-upload.js";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

/**
 * Serves files stored by the local-dev-disk upload provider. Filenames are
 * random, immutable and public by design (they are slide images); the resolve
 * + prefix check blocks path traversal.
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, "path") ?? "";
  const resolved = path.resolve(LOCAL_UPLOADS_DIR, raw);
  if (!resolved.startsWith(LOCAL_UPLOADS_DIR + path.sep)) {
    setResponseStatus(event, 400);
    return "Bad request";
  }
  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    setResponseStatus(event, 404);
    return "Not found";
  }
  try {
    const data = await fs.promises.readFile(resolved);
    setResponseHeader(event, "content-type", contentType);
    setResponseHeader(
      event,
      "cache-control",
      "public, max-age=31536000, immutable",
    );
    return data;
  } catch {
    setResponseStatus(event, 404);
    return "Not found";
  }
});
