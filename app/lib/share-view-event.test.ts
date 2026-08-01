import { describe, expect, it } from "vitest";

import {
  MAX_DWELL_MS,
  clampDwellMs,
  shouldSkipShareView,
} from "./share-view-event";

describe("shouldSkipShareView", () => {
  it("skips owner previews", () => {
    expect(shouldSkipShareView("?preview=1")).toBe(true);
    expect(shouldSkipShareView("?foo=bar&preview=1")).toBe(true);
  });

  it("records normal visits", () => {
    expect(shouldSkipShareView("")).toBe(false);
    expect(shouldSkipShareView("?foo=bar")).toBe(false);
  });
});

describe("clampDwellMs", () => {
  it("rounds normal dwells", () => {
    expect(clampDwellMs(1234.6)).toBe(1235);
  });

  it("clamps negative and non-finite values to zero", () => {
    expect(clampDwellMs(-50)).toBe(0);
    expect(clampDwellMs(Number.NaN)).toBe(0);
  });

  it("caps at the server's one-hour ceiling", () => {
    expect(clampDwellMs(MAX_DWELL_MS + 5000)).toBe(MAX_DWELL_MS);
  });
});
