import { describe, it, expect } from "vitest";

import { ASPECT_RATIOS } from "./aspect-ratios";
import {
  MAX_SLIDE_AREA,
  MAX_SLIDE_DIM,
  MIN_SLIDE_DIM,
  SIZE_PRESETS,
  SIZE_PRESET_VALUES,
  getPresetSize,
  getSlideDims,
  isUniformSize,
  isValidSlideDims,
} from "./slide-size";

describe("SIZE_PRESETS", () => {
  it("every preset is within the validation bounds", () => {
    for (const key of SIZE_PRESET_VALUES) {
      const p = SIZE_PRESETS[key];
      expect(isValidSlideDims(p.width, p.height)).toBe(true);
    }
  });

  it("SIZE_PRESET_VALUES matches the table keys", () => {
    expect(new Set(SIZE_PRESET_VALUES)).toEqual(new Set(Object.keys(SIZE_PRESETS)));
  });

  it("getPresetSize returns materialized dims with the preset key", () => {
    expect(getPresetSize("ig-story")).toEqual({
      width: 1080,
      height: 1920,
      preset: "ig-story",
    });
  });

  it("getPresetSize returns null for unknown and inherited keys", () => {
    expect(getPresetSize("nope")).toBeNull();
    expect(getPresetSize("toString")).toBeNull();
    expect(getPresetSize("hasOwnProperty")).toBeNull();
  });
});

describe("isValidSlideDims", () => {
  it("accepts in-range integers", () => {
    expect(isValidSlideDims(1200, 628)).toBe(true);
    expect(isValidSlideDims(MIN_SLIDE_DIM, MIN_SLIDE_DIM)).toBe(true);
  });

  it("rejects non-integers, out-of-range, and oversized areas", () => {
    expect(isValidSlideDims(100.5, 100)).toBe(false);
    expect(isValidSlideDims(MIN_SLIDE_DIM - 1, 100)).toBe(false);
    expect(isValidSlideDims(MAX_SLIDE_DIM + 1, 100)).toBe(false);
    expect(isValidSlideDims(MAX_SLIDE_DIM, MAX_SLIDE_DIM)).toBe(false); // area cap
    expect(isValidSlideDims(3840, 2160)).toBe(true); // exactly MAX_SLIDE_AREA
    expect(3840 * 2160).toBe(MAX_SLIDE_AREA);
  });

  it("rejects non-numbers", () => {
    expect(isValidSlideDims("1080", 1080)).toBe(false);
    expect(isValidSlideDims(undefined, undefined)).toBe(false);
    expect(isValidSlideDims(NaN, 1080)).toBe(false);
  });
});

describe("getSlideDims", () => {
  it("uses explicit slide.size when valid", () => {
    expect(getSlideDims({ size: { width: 1200, height: 628 } }, "16:9")).toEqual(
      { width: 1200, height: 628 },
    );
  });

  it("falls back to the deck aspect ratio without a size", () => {
    expect(getSlideDims({}, "9:16")).toEqual({
      width: ASPECT_RATIOS["9:16"].width,
      height: ASPECT_RATIOS["9:16"].height,
    });
  });

  it("falls back to 16:9 with neither (legacy decks)", () => {
    expect(getSlideDims(undefined, undefined)).toEqual({
      width: 960,
      height: 540,
    });
    expect(getSlideDims(null, null)).toEqual({ width: 960, height: 540 });
  });

  it("ignores an invalid stored size and falls back", () => {
    expect(
      getSlideDims({ size: { width: 0, height: -5 } }, "1:1"),
    ).toEqual({
      width: ASPECT_RATIOS["1:1"].width,
      height: ASPECT_RATIOS["1:1"].height,
    });
  });
});

describe("isUniformSize", () => {
  it("true for empty and single-slide lists", () => {
    expect(isUniformSize([], "16:9")).toBe(true);
    expect(isUniformSize([{ size: { width: 1080, height: 1080 } }])).toBe(true);
  });

  it("true when all slides resolve to the same canvas", () => {
    expect(
      isUniformSize([{}, {}, { size: { width: 960, height: 540 } }], "16:9"),
    ).toBe(true);
  });

  it("false for mixed sizes", () => {
    expect(
      isUniformSize(
        [{ size: { width: 1080, height: 1080 } }, {}],
        "16:9",
      ),
    ).toBe(false);
  });
});
