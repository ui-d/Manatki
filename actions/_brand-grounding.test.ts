import { describe, expect, it } from "vitest";

import { buildBrandGrounding } from "./_brand-grounding";

const TOKENS = {
  colors: {
    primary: "#EC4899",
    secondary: "#8B5CF6",
    accent: "#00E5FF",
    background: "#0B0B10",
    surface: "#17171F",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.55)",
  },
  typography: {
    headingFont: "Poppins, sans-serif",
    bodyFont: "Inter, sans-serif",
    headingWeight: "800",
    bodyWeight: "400",
    headingSizes: { h1: "64px", h2: "40px", h3: "28px" },
  },
  imageStyle: {
    referenceUrls: ["https://cdn.example.com/style-1.png"],
    styleDescription: "Soft-focus product photography with warm grading",
  },
};

describe("buildBrandGrounding", () => {
  it("builds a prompt block with palette, fonts, imagery style and notes", () => {
    const grounding = buildBrandGrounding({
      id: "ds1",
      data: JSON.stringify(TOKENS),
      customInstructions: "Never use pure black; prefer warm shadows.",
    });

    expect(grounding).not.toBeNull();
    expect(grounding!.designSystemId).toBe("ds1");
    expect(grounding!.promptBlock).toContain("BRAND STYLE");
    expect(grounding!.promptBlock).toContain("primary #EC4899");
    expect(grounding!.promptBlock).toContain("headings Poppins");
    expect(grounding!.promptBlock).toContain("Soft-focus product photography");
    expect(grounding!.promptBlock).toContain("Never use pure black");
  });

  it("collects reference URLs from imageStyle and image assets, capped at 4", () => {
    const assets = Array.from({ length: 6 }, (_, i) => ({
      id: `a${i}`,
      name: `asset ${i}`,
      type: i === 0 ? "logo" : "image",
      url: `https://cdn.example.com/asset-${i}.png`,
      mimeType: "image/png",
    }));
    const grounding = buildBrandGrounding({
      id: "ds1",
      data: JSON.stringify(TOKENS),
      assets: JSON.stringify(assets),
    });

    expect(grounding!.referenceImageUrls).toHaveLength(4);
    expect(grounding!.referenceImageUrls[0]).toBe(
      "https://cdn.example.com/style-1.png",
    );
    // Logos are excluded — they'd get copied into the artwork.
    expect(grounding!.referenceImageUrls).not.toContain(
      "https://cdn.example.com/asset-0.png",
    );
  });

  it("truncates long custom instructions", () => {
    const grounding = buildBrandGrounding({
      id: "ds1",
      data: JSON.stringify(TOKENS),
      customInstructions: "x".repeat(900),
    });
    expect(grounding!.promptBlock.length).toBeLessThan(900);
    expect(grounding!.promptBlock).toContain("…");
  });

  it("returns null without parseable color tokens", () => {
    expect(buildBrandGrounding({ id: "ds1", data: null })).toBeNull();
    expect(buildBrandGrounding({ id: "ds1", data: "not json" })).toBeNull();
    expect(
      buildBrandGrounding({ id: "ds1", data: JSON.stringify({}) }),
    ).toBeNull();
  });
});
