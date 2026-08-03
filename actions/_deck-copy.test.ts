import { describe, expect, it } from "vitest";

import { copyDeckData } from "./_deck-copy";

const NOW = "2026-08-03T00:00:00.000Z";

function source() {
  return {
    title: "Original",
    kind: "social",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    isTemplate: true,
    templateMeta: { savedAt: "x" },
    slides: [
      { id: "slide-a", content: "<div>A</div>", size: { width: 1080, height: 1080 } },
      { id: "slide-b", content: "<div>B</div>" },
      { id: "slide-c", content: "<div>C</div>" },
    ],
  };
}

describe("copyDeckData", () => {
  it("regenerates every slide id and stamps title/timestamps", () => {
    const src = source();
    const copy = copyDeckData(src, { title: "Copy", now: NOW });

    expect(copy.title).toBe("Copy");
    expect(copy.createdAt).toBe(NOW);
    expect(copy.updatedAt).toBe(NOW);
    const ids = (copy.slides as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(id).toMatch(/^slide-/);
      expect(["slide-a", "slide-b", "slide-c"]).not.toContain(id);
    }
    // Slide payload beyond ids is preserved.
    expect((copy.slides as any)[0].size).toEqual({ width: 1080, height: 1080 });
    expect((copy.slides as any)[1].content).toBe("<div>B</div>");
  });

  it("does not mutate the source", () => {
    const src = source();
    const before = JSON.stringify(src);
    copyDeckData(src, { title: "Copy", now: NOW });
    expect(JSON.stringify(src)).toBe(before);
  });

  it("copies only the requested slide subset in source order", () => {
    const copy = copyDeckData(source(), {
      title: "One asset",
      now: NOW,
      slideIds: ["slide-c", "slide-a"],
    });
    const contents = (copy.slides as Array<{ content: string }>).map(
      (s) => s.content,
    );
    expect(contents).toEqual(["<div>A</div>", "<div>C</div>"]);
  });

  it("throws on unknown slide ids", () => {
    expect(() =>
      copyDeckData(source(), {
        title: "x",
        now: NOW,
        slideIds: ["slide-a", "nope"],
      }),
    ).toThrow(/nope/);
  });

  it("carries template flags through — callers decide to set or strip them", () => {
    const copy = copyDeckData(source(), { title: "Copy", now: NOW });
    expect(copy.isTemplate).toBe(true);
    expect(copy.templateMeta).toEqual({ savedAt: "x" });
  });
});
