import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { deleteDeck, pngDimensions, seedDeck, uniqueTitle } from "./helpers";

/**
 * Full-visual (poster) asset contract: a social asset whose whole canvas is
 * a cover-fit background image with scrim + HTML copy overlay must render
 * in the editor and export at intrinsic canvas size. The background layer is
 * absolutely positioned at z-index -1 — historically the kind of DOM the
 * export stage could mishandle.
 */

// Same-origin fixture so the raster capture is never CORS-tainted.
const BG_SRC = "/icon-512.svg";

function fullVisualHtml(headline: string): string {
  return `<div class="fmd-slide" style="position: relative; font-family: 'Poppins', sans-serif;">
  <img class="fmd-img-uploaded fmd-bg-image" src="${BG_SRC}" alt="Poster artwork" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1;">
  <div class="fmd-bg-scrim" style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%); z-index: -1; pointer-events: none;"></div>
  <div style="position: absolute; left: 90px; right: 90px; bottom: 320px; display: flex; flex-direction: column; gap: 24px;">
    <div style="font-size: 26px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #00E5FF;">POSTER TEST</div>
    <h1 style="font-size: 96px; font-weight: 900; color: #fff; line-height: 1.05; margin: 0;">${headline}</h1>
  </div>
</div>`;
}

async function openEditor(page: Page, deckId: string, firstSlideId: string) {
  await page.goto(`/deck/${deckId}`);
  await expect(
    page.locator(`[data-slide-canvas="${firstSlideId}"]`).first(),
  ).toBeVisible();
}

test.describe("full-visual poster asset", () => {
  let deckId: string;

  test.beforeAll(() => {
    deckId = seedDeck({
      title: uniqueTitle("E2E Poster Asset"),
      kind: "social",
      sizePreset: "ig-story",
      slides: [{ id: "poster-1", content: fullVisualHtml("Edge To Edge") }],
    });
  });

  test.afterAll(() => {
    if (deckId) deleteDeck(deckId);
  });

  test("renders background layer, scrim, and overlay copy in the editor", async ({
    page,
  }) => {
    await openEditor(page, deckId, "poster-1");
    const canvas = page.locator('[data-slide-canvas="poster-1"]').first();

    const bg = canvas.locator("img.fmd-bg-image");
    await expect(bg).toBeVisible();
    await expect(bg).toHaveAttribute("style", /object-fit:\s*cover/);
    await expect(bg).toHaveAttribute("style", /z-index:\s*-1/);

    await expect(canvas.locator(".fmd-bg-scrim")).toHaveCount(1);
    await expect(canvas.getByText("Edge To Edge")).toBeVisible();

    // Paint order: the background layer sits behind the copy (z-index -1 in
    // a positioned slide root). Insertion order is unit-tested at the lib
    // level; the editor may inject its own decorations around slide children.
    const bgZ = await bg.evaluate((el) => getComputedStyle(el).zIndex);
    expect(bgZ).toBe("-1");
  });

  test("PNG export captures the poster at intrinsic story size", async ({
    page,
  }) => {
    await openEditor(page, deckId, "poster-1");

    await page.getByRole("button", { name: "Export" }).click();
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page
      .getByRole("menuitem", { name: "Download PNG (current asset)" })
      .click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const dims = pngDimensions(fs.readFileSync(filePath));
    expect(dims).toEqual({ width: 2160, height: 3840 });

    await expect(page.getByText("Export failed")).not.toBeVisible();
  });
});
