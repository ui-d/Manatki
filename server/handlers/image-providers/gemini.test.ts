import { describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

vi.mock("@agent-native/core/server", () => ({
  resolveSecret: vi.fn(async () => "test-gemini-key"),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent: generateContentMock } };
  }),
}));

import { GeminiProvider } from "./gemini.js";

describe("GeminiProvider", () => {
  it("tries GA model ids, never the retired -preview aliases", async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } },
            ],
          },
        },
      ],
    });

    const result = await new GeminiProvider().generate("a red circle");

    expect(result.model).toBe("gemini-3.1-flash-image");
    const triedModels = generateContentMock.mock.calls.map(
      (call) => call[0].model,
    );
    expect(triedModels).toEqual(["gemini-3.1-flash-image"]);
    expect(triedModels).not.toContain("gemini-3.1-flash-image-preview");
    expect(triedModels).not.toContain("gemini-3-pro-image-preview");
  });

  it("maps provider config onto imageConfig", async () => {
    generateContentMock.mockClear();
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } },
            ],
          },
        },
      ],
    });

    await new GeminiProvider().generate("a red circle", [], undefined, {
      aspectRatio: "9:16",
      size: "2K",
    });

    const request = generateContentMock.mock.calls[0][0];
    expect(request.config.imageConfig).toEqual({
      aspectRatio: "9:16",
      imageSize: "2K",
    });
  });

  it("omits imageConfig when no config is supplied", async () => {
    generateContentMock.mockClear();
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } },
            ],
          },
        },
      ],
    });

    await new GeminiProvider().generate("a red circle");

    const request = generateContentMock.mock.calls[0][0];
    expect(request.config.imageConfig).toBeUndefined();
  });

  it("asset mode keeps the anti-mockup clause; poster mode lifts it", async () => {
    const okResponse = {
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } },
            ],
          },
        },
      ],
    };
    const refs = [{ data: "aW1n", mimeType: "image/png" }];

    generateContentMock.mockClear();
    generateContentMock.mockResolvedValue(okResponse);
    await new GeminiProvider().generate("a mountain", refs, undefined, {
      mode: "asset",
    });
    const assetText = generateContentMock.mock.calls[0][0].contents.at(-1).text;
    expect(assetText).toContain("NOT a slide mockup");
    expect(assetText).toContain("placed INTO a slide");
    expect(assetText).toContain("No visible text by default");

    generateContentMock.mockClear();
    generateContentMock.mockResolvedValue(okResponse);
    await new GeminiProvider().generate("a mountain", refs, undefined, {
      mode: "poster",
      overlayZone: "bottom",
      canvasNotes: "Keep the top 220px clear.",
    });
    const posterText =
      generateContentMock.mock.calls[0][0].contents.at(-1).text;
    expect(posterText).toContain("FULL-CANVAS visual composition");
    expect(posterText).not.toContain("placed INTO a slide");
    expect(posterText).toContain("bottom third of the frame visually calm");
    expect(posterText).toContain("Keep the top 220px clear.");
    expect(posterText).toContain("No visible text by default");
  });

  it("poster mode without reference images still gets poster instructions", async () => {
    generateContentMock.mockClear();
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } },
            ],
          },
        },
      ],
    });
    await new GeminiProvider().generate("a mountain", [], undefined, {
      mode: "poster",
      brandStyle: "BRAND STYLE (from the linked design system):\n- Palette: x",
    });
    const text = generateContentMock.mock.calls[0][0].contents.at(-1).text;
    expect(text).toContain("FULL-CANVAS visual composition");
    expect(text).toContain("BRAND STYLE");
  });

  it("allowTextInImage swaps the no-text rule for a verbatim-text rule", async () => {
    generateContentMock.mockClear();
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } },
            ],
          },
        },
      ],
    });
    await new GeminiProvider().generate(
      'poster with the words "SUMMER SALE"',
      [{ data: "aW1n", mimeType: "image/png" }],
      undefined,
      { mode: "poster", allowTextInImage: true },
    );
    const text = generateContentMock.mock.calls[0][0].contents.at(-1).text;
    expect(text).toContain("letter for letter");
    expect(text).not.toContain("No visible text by default");
  });

  it("edit() uses the GA model cascade", async () => {
    generateContentMock.mockClear();
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } },
            ],
          },
        },
      ],
    });

    const result = await new GeminiProvider().edit(
      Buffer.from("img"),
      "remove background",
    );

    expect(result.model).toBe("gemini-3.1-flash-image");
    expect(generateContentMock.mock.calls[0][0].model).toBe(
      "gemini-3.1-flash-image",
    );
  });
});
