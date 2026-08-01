import { describe, expect, it } from "vitest";

import { shouldSkipShareView } from "./share-view-event";

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
