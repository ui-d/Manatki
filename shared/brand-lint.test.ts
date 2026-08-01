import { describe, expect, it } from "vitest";

import type { DesignSystemData } from "./api";
import { lintDeckBrand, parseCssColor } from "./brand-lint";

const TOKENS: DesignSystemData = {
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
  spacing: { slidePadding: "64px", elementGap: "24px" },
  borders: { radius: "16px", accentWidth: "4px" },
  slideDefaults: { background: "#0B0B10", labelStyle: "uppercase" },
  logos: [],
};

function slide(content: string, id = "slide-1") {
  return { id, content };
}

describe("parseCssColor", () => {
  it("parses hex forms", () => {
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseCssColor("#EC4899")).toEqual({ r: 236, g: 72, b: 153 });
    expect(parseCssColor("#EC4899CC")).toEqual({ r: 236, g: 72, b: 153 });
  });

  it("parses rgb/rgba/hsl functions", () => {
    expect(parseCssColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseCssColor("rgba(255,255,255,0.55)")).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
    expect(parseCssColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("parses common named colors and rejects garbage", () => {
    expect(parseCssColor("white")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseCssColor("black")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseCssColor("bananas")).toBeNull();
    expect(parseCssColor("var(--accent)")).toBeNull();
  });
});

describe("lintDeckBrand — colors", () => {
  it("accepts palette colors, neutrals, and near-palette values", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<div class="fmd-slide" style="background:#0B0B10;color:#FFFFFF;">` +
            `<h1 style="color:#EC4899;border-bottom:4px solid #00E5FF;">Hi</h1>` +
            `<p style="color:#e9e9ee;background:rgba(255,255,255,0.06);">x</p>` +
            // One digit off primary — inside tolerance.
            `<span style="color:#EC4A99;">y</span></div>`,
        ),
      ],
      TOKENS,
    );
    expect(result.violations).toEqual([]);
  });

  it("flags saturated off-palette colors with a nearest-token suggestion", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<div class="fmd-slide" style="background:#0B0B10;">` +
            `<h1 style="color:#22C55E;">Green</h1>` +
            `<p style="border-color:#22C55E;">again</p></div>`,
        ),
      ],
      TOKENS,
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      rule: "off-palette-color",
      slideIndex: 0,
      slideId: "slide-1",
      value: "#22c55e",
      occurrences: 2,
    });
    expect(result.violations[0].suggestion?.token).toMatch(/^colors\./);
  });

  it("ignores colors in gradients only when on palette, flags foreign stops", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<div class="fmd-slide" style="background:linear-gradient(135deg,#EC4899,#F97316);">x</div>`,
        ),
      ],
      TOKENS,
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].value).toBe("#f97316");
  });

  it("does not scan visible text or non-style attributes", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<div class="fmd-slide"><p>Our green is #22C55E</p>` +
            `<a href="#22C55E">anchor</a></div>`,
        ),
      ],
      TOKENS,
    );
    expect(result.violations).toEqual([]);
  });

  it("scans <style> blocks inside slide content", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<style>.x { color: #F97316; }</style><div class="fmd-slide">x</div>`,
        ),
      ],
      TOKENS,
    );
    expect(result.violations).toHaveLength(1);
  });
});

describe("lintDeckBrand — fonts", () => {
  it("accepts brand fonts, their fallback stacks, and generic families", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<div class="fmd-slide" style="font-family:Inter, sans-serif;">` +
            `<h1 style="font-family:'Poppins', sans-serif;">Hi</h1>` +
            `<code style="font-family:monospace;">x</code></div>`,
        ),
      ],
      TOKENS,
    );
    expect(result.violations).toEqual([]);
  });

  it("flags foreign font families", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<div class="fmd-slide" style="font-family:'Comic Sans MS', cursive;">x</div>`,
        ),
      ],
      TOKENS,
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      rule: "off-brand-font",
      value: "Comic Sans MS",
    });
    expect(result.violations[0].suggestion).toEqual({
      token: "typography.bodyFont",
      value: "Inter, sans-serif",
    });
  });

  it("skips declarations driven by CSS variables", () => {
    const result = lintDeckBrand(
      [
        slide(
          `<div class="fmd-slide" style="font-family:var(--mk-font);">x</div>`,
        ),
      ],
      TOKENS,
    );
    expect(result.violations).toEqual([]);
  });
});

describe("lintDeckBrand — aggregation", () => {
  it("reports slide index and id per violation and counts scanned slides", () => {
    const result = lintDeckBrand(
      [
        slide(`<div class="fmd-slide" style="color:#FFFFFF;">clean</div>`, "a"),
        slide(`<div class="fmd-slide" style="color:#F97316;">dirty</div>`, "b"),
      ],
      TOKENS,
    );

    expect(result.scannedSlides).toBe(2);
    expect(result.violationCount).toBe(1);
    expect(result.violations[0]).toMatchObject({ slideIndex: 1, slideId: "b" });
  });
});
