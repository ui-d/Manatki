import { describe, expect, it, vi } from "vitest";

const mockUploadImageAsset = vi.hoisted(() =>
  vi.fn(async () => ({ url: "https://cdn.example.com/hosted.png" })),
);
vi.mock("../server/handlers/assets.js", () => ({
  uploadImageAsset: mockUploadImageAsset,
}));
vi.mock("@agent-native/core/server/request-context", () => ({
  getRequestUserEmail: () => "owner@example.com",
}));

import {
  MAX_SLIDE_CONTENT_BYTES,
  INLINE_IMAGE_REWRITE_THRESHOLD_CHARS,
} from "../shared/slide-content-limits";

import {
  findLargeInlineImages,
  prepareSlideContentForPersist,
  rewriteInlineImagesToHostedUrls,
} from "./_slide-content";

function bigDataUri(): string {
  const payload = "A".repeat(INLINE_IMAGE_REWRITE_THRESHOLD_CHARS + 100);
  return `data:image/png;base64,${payload}`;
}

describe("findLargeInlineImages", () => {
  it("finds unique large data URIs and ignores small ones", () => {
    const big = bigDataUri();
    const small = "data:image/png;base64,AAAA";
    const content = `<img src="${big}"><img src="${big}"><img src="${small}">`;

    const found = findLargeInlineImages(content);

    expect(found).toEqual([big]);
  });

  it("returns nothing for content without data URIs", () => {
    expect(findLargeInlineImages("<div>plain</div>")).toEqual([]);
  });
});

describe("rewriteInlineImagesToHostedUrls", () => {
  it("uploads large inline images and rewrites every occurrence", async () => {
    const big = bigDataUri();
    const content = `<img src="${big}"><img src="${big}">`;

    const result = await rewriteInlineImagesToHostedUrls(content);

    expect(mockUploadImageAsset).toHaveBeenCalledTimes(1);
    expect(result).toBe(
      '<img src="https://cdn.example.com/hosted.png"><img src="https://cdn.example.com/hosted.png">',
    );
  });

  it("keeps the data URI when the upload fails", async () => {
    mockUploadImageAsset.mockRejectedValueOnce(new Error("no provider"));
    const big = bigDataUri();

    const result = await rewriteInlineImagesToHostedUrls(`<img src="${big}">`);

    expect(result).toContain(big);
  });
});

describe("prepareSlideContentForPersist", () => {
  it("rejects content over the persist cap with a 413", async () => {
    const huge = "x".repeat(MAX_SLIDE_CONTENT_BYTES + 1);

    await expect(prepareSlideContentForPersist(huge)).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it("passes normal slide HTML through untouched", async () => {
    const html = '<div class="fmd-slide">hello</div>';
    await expect(prepareSlideContentForPersist(html)).resolves.toBe(html);
  });
});
