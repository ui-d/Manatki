import { describe, expect, it } from "vitest";

import {
  cropGuidanceLine,
  planForPreset,
  planImageAspect,
} from "./image-aspect";
import { SIZE_PRESETS, SIZE_PRESET_VALUES } from "./slide-size";

describe("planImageAspect", () => {
  // Expected Gemini snap for every shipped preset — drift guard: adding or
  // changing a preset must update this table deliberately.
  const EXPECTED_SNAPS: Record<string, string> = {
    "ig-square": "1:1",
    "ig-portrait": "4:5",
    "fb-post": "16:9",
    "x-post": "16:9",
    "ig-story": "9:16",
    "pinterest-pin": "2:3",
    "linkedin-banner": "21:9",
    "x-header": "21:9",
    "fb-cover": "21:9",
    "email-header": "21:9",
    "og-banner": "16:9",
    "yt-thumbnail": "16:9",
    "ad-mrec": "5:4",
    "ad-half-page": "9:16",
    "ad-leaderboard": "21:9",
  };

  it("covers every preset in the expectation table", () => {
    expect(Object.keys(EXPECTED_SNAPS).sort()).toEqual(
      [...SIZE_PRESET_VALUES].sort(),
    );
  });

  it.each(SIZE_PRESET_VALUES)("snaps %s to its expected ratio", (preset) => {
    const { width, height } = SIZE_PRESETS[preset];
    const plan = planImageAspect(width, height);
    expect(plan.aspectRatio).toBe(EXPECTED_SNAPS[preset]);
  });

  it("returns exact-match mismatch 0 for native ratios", () => {
    expect(planImageAspect(1080, 1080).mismatch).toBe(0);
    expect(planImageAspect(1080, 1920).mismatch).toBe(0);
    expect(planImageAspect(1080, 1350).mismatch).toBe(0);
  });

  it("reports a large mismatch for the leaderboard strip", () => {
    const plan = planImageAspect(728, 90);
    expect(plan.aspectRatio).toBe("21:9");
    expect(plan.mismatch).toBeGreaterThan(0.5);
  });

  it("picks the OpenAI size by orientation", () => {
    expect(planImageAspect(1080, 1080).openaiSize).toBe("1024x1024");
    expect(planImageAspect(1080, 1920).openaiSize).toBe("1024x1536");
    expect(planImageAspect(1600, 900).openaiSize).toBe("1536x1024");
    expect(planImageAspect(1584, 396).openaiSize).toBe("1536x1024");
  });

  it("reports OpenAI mismatch separately (story canvas vs 1024x1536)", () => {
    const plan = planImageAspect(1080, 1920);
    expect(plan.mismatch).toBe(0); // Gemini has native 9:16
    expect(plan.openaiMismatch).toBeGreaterThan(0.15); // 2:3 ≠ 9:16
  });

  it("tiers Gemini imageSize by the largest dimension", () => {
    expect(planImageAspect(600, 200).imageSize).toBe("1K");
    expect(planImageAspect(1024, 1024).imageSize).toBe("1K");
    expect(planImageAspect(1080, 1080).imageSize).toBe("2K");
    expect(planImageAspect(2048, 1152).imageSize).toBe("2K");
    expect(planImageAspect(1080, 1920).imageSize).toBe("2K");
    expect(planImageAspect(3840, 2160).imageSize).toBe("4K");
  });

  it("throws on degenerate dims", () => {
    expect(() => planImageAspect(0, 100)).toThrow();
    expect(() => planImageAspect(100, -5)).toThrow();
    expect(() => planImageAspect(NaN, 100)).toThrow();
  });
});

describe("planForPreset", () => {
  it("resolves known presets", () => {
    const plan = planForPreset("ig-story");
    expect(plan?.aspectRatio).toBe("9:16");
    expect(plan?.imageSize).toBe("2K");
  });

  it("returns null for unknown presets", () => {
    expect(planForPreset("not-a-preset")).toBeNull();
  });
});

describe("cropGuidanceLine", () => {
  it("is empty for close snaps and present for far ones", () => {
    expect(cropGuidanceLine(0)).toBe("");
    expect(cropGuidanceLine(0.1)).toBe("");
    expect(cropGuidanceLine(0.3)).toContain("cropped");
  });
});
