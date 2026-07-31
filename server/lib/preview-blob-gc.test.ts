// @vitest-environment node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDel = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@vercel/blob", () => ({ del: mockDel, put: vi.fn() }));

import { LOCAL_UPLOADS_DIR } from "../plugins/file-upload";

import { deletePreviewBlob } from "./preview-blob-gc";

const OWNER = "owner@example.com";
const ownerScope = crypto
  .createHash("sha256")
  .update(OWNER)
  .digest("hex")
  .slice(0, 16);

describe("deletePreviewBlob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("deletes local-dev files by basename only (no traversal)", async () => {
    await fs.promises.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
    const file = path.join(LOCAL_UPLOADS_DIR, "gc-test-preview.png");
    await fs.promises.writeFile(file, "x");

    const result = await deletePreviewBlob("/uploads/gc-test-preview.png", [
      OWNER,
    ]);

    expect(result).toBe("deleted");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("deletes vercel-blob URLs inside a trusted owner scope", async () => {
    const url = `https://abc123.public.blob.vercel-storage.com/uploads/${ownerScope}/preview-xyz.png`;

    const result = await deletePreviewBlob(url, [OWNER, null]);

    expect(result).toBe("deleted");
    expect(mockDel).toHaveBeenCalledWith(url);
  });

  it("skips blobs outside every trusted scope", async () => {
    const url = `https://abc123.public.blob.vercel-storage.com/uploads/deadbeefdeadbeef/preview.png`;

    const result = await deletePreviewBlob(url, [OWNER]);

    expect(result).toBe("skipped");
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("skips non-blob-store hosts entirely", async () => {
    const result = await deletePreviewBlob(
      `https://example.com/uploads/${ownerScope}/preview.png`,
      [OWNER],
    );

    expect(result).toBe("skipped");
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("skips (not throws) when the local file is already gone", async () => {
    const result = await deletePreviewBlob("/uploads/never-existed.png", [
      OWNER,
    ]);

    expect(result).toBe("skipped");
  });
});
