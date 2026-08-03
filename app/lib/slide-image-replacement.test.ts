// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  createPlaceholderImageTarget,
  insertImageIntoSlideHtml,
  replaceImageTargetInSlideHtml,
  setSlideBackgroundImage,
} from "./slide-image-replacement";

function firstImage(html: string): HTMLImageElement | null {
  return new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector("img");
}

describe("slide image replacement", () => {
  it("replaces a clicked placeholder target with an uploaded image", () => {
    const html = `<div class="fmd-slide"><div class="fmd-img-placeholder" style="width: 100%; height: 100%;">Hero image</div></div>`;
    const updated = replaceImageTargetInSlideHtml(
      html,
      createPlaceholderImageTarget(0, "Hero image"),
      "/uploads/user/photo.jpg",
      { alt: "photo.jpg" },
    );
    const img = firstImage(updated);

    expect(updated).not.toContain("fmd-img-placeholder");
    expect(img?.getAttribute("src")).toBe("/uploads/user/photo.jpg");
    expect(img?.getAttribute("alt")).toBe("photo.jpg");
    expect(img?.classList.contains("fmd-img-uploaded")).toBe(true);
  });

  it("replaces an existing image src", () => {
    const html = `<div class="fmd-slide"><img src="/old.png" alt="Old"></div>`;
    const updated = replaceImageTargetInSlideHtml(
      html,
      "/old.png",
      "/uploads/new.png",
      { alt: "New" },
    );
    const img = firstImage(updated);

    expect(img?.getAttribute("src")).toBe("/uploads/new.png");
    expect(img?.getAttribute("alt")).toBe("New");
  });

  it("drops into the first placeholder when no target is selected", () => {
    const html = `<div class="fmd-slide"><h1>Slide</h1><div class="fmd-img-placeholder">Image description</div></div>`;
    const updated = insertImageIntoSlideHtml(html, "/uploads/drop.png", {
      alt: "drop.png",
    });
    const img = firstImage(updated);

    expect(updated).not.toContain("fmd-img-placeholder");
    expect(img?.getAttribute("src")).toBe("/uploads/drop.png");
  });

  it("adds a positioned background layer when the slide has no placeholder at all", () => {
    const html = `<div class="fmd-slide"><h1>Slide with no image</h1></div>`;
    const updated = insertImageIntoSlideHtml(html, "/uploads/drop.png");
    const doc = new DOMParser().parseFromString(updated, "text/html");
    const img = doc.querySelector("img");
    const slideRoot = doc.querySelector(".fmd-slide") as HTMLElement | null;

    expect(img?.getAttribute("src")).toBe("/uploads/drop.png");
    // Must not become a plain flex-flow sibling of the existing content
    // (the slide is a flex column), or it visually squishes everything else.
    expect(img?.getAttribute("style")).toContain("position: absolute");
    expect(slideRoot?.getAttribute("style")).toContain("position: relative");
    expect(doc.querySelector("h1")).not.toBeNull();
  });
});

describe("setSlideBackgroundImage", () => {
  it("backgrounds even when a placeholder exists, leaving it untouched", () => {
    const html = `<div class="fmd-slide" style="display: flex;"><div class="fmd-img-placeholder">Hero</div><h1>Title</h1></div>`;
    const updated = setSlideBackgroundImage(html, "/uploads/bg.png", {
      alt: "bg",
    });
    const doc = new DOMParser().parseFromString(updated, "text/html");
    const img = doc.querySelector("img");

    expect(doc.querySelector(".fmd-img-placeholder")).not.toBeNull();
    expect(img?.classList.contains("fmd-bg-image")).toBe(true);
    expect(img?.getAttribute("style")).toContain("object-fit: cover");
    expect(img?.getAttribute("style")).toContain("z-index: -1");
    expect(
      doc.querySelector<HTMLElement>(".fmd-slide")?.getAttribute("style"),
    ).toContain("position: relative");
    // Background layer is the first child so content paints above it.
    expect(
      doc.querySelector(".fmd-slide")?.firstElementChild?.tagName,
    ).toBe("IMG");
  });

  it("swaps the src of an existing background layer instead of stacking", () => {
    const html = `<div class="fmd-slide" style="position: relative;"><img class="fmd-img-uploaded fmd-bg-image" src="/old-bg.png" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1;"><h1>Title</h1></div>`;
    const updated = setSlideBackgroundImage(html, "/new-bg.png", {
      alt: "new",
    });
    const doc = new DOMParser().parseFromString(updated, "text/html");
    const imgs = doc.querySelectorAll("img");

    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe("/new-bg.png");
    expect(imgs[0].getAttribute("alt")).toBe("new");
  });

  it("detects a style-only background image without the marker class", () => {
    const html = `<div class="fmd-slide"><img src="/agent-bg.png" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1;"><p>Copy</p></div>`;
    const updated = setSlideBackgroundImage(html, "/replacement.png");
    const doc = new DOMParser().parseFromString(updated, "text/html");

    expect(doc.querySelectorAll("img").length).toBe(1);
    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "/replacement.png",
    );
  });

  it("adds a scrim once when requested", () => {
    const html = `<div class="fmd-slide"><h1>Overlay copy</h1></div>`;
    const once = setSlideBackgroundImage(html, "/bg.png", { scrim: true });
    const twice = setSlideBackgroundImage(once, "/bg2.png", { scrim: true });
    const doc = new DOMParser().parseFromString(twice, "text/html");

    expect(doc.querySelectorAll(".fmd-bg-scrim").length).toBe(1);
    const scrim = doc.querySelector<HTMLElement>(".fmd-bg-scrim");
    expect(scrim?.getAttribute("style")).toContain("linear-gradient");
    // Scrim sits after the image so it paints above it at the same z-index.
    expect(scrim?.previousElementSibling?.tagName).toBe("IMG");
  });
});
