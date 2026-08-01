import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

import { deleteDeck, pngDimensions, seedDeck, slideHtml } from "./helpers";

/**
 * H7 — exports must not depend on incidental editor DOM state. The offscreen
 * export stage guarantees a full-resolution [data-slide-canvas] source per
 * slide, so exports succeed with the sidebar rail collapsed and capture at
 * intrinsic canvas size rather than a scaled thumbnail's size.
 */

async function openEditor(page: Page, deckId: string, firstSlideId: string) {
  await page.goto(`/deck/${deckId}`);
  await expect(
    page.locator(`[data-slide-canvas="${firstSlideId}"]`).first(),
  ).toBeVisible();
}

async function downloadViaExportMenu(
  page: Page,
  itemLabel: string,
): Promise<string> {
  await page.getByRole("button", { name: "Export" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("menuitem", { name: itemLabel }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return filePath;
}

test.describe("deck exports under DOM-state stress", () => {
  let deckId: string;

  test.beforeAll(() => {
    deckId = seedDeck({
      title: "E2E Export Deck",
      slides: [
        {
          id: "slide-1",
          content: slideHtml("Export One"),
          notes: "First slide speaker notes",
        },
        { id: "slide-2", content: slideHtml("Export Two", "#0f766e") },
        { id: "slide-3", content: slideHtml("Export Three", "#9d174d") },
      ],
    });
  });

  test.afterAll(() => {
    if (deckId) deleteDeck(deckId);
  });

  test("PDF export succeeds with the slide rail collapsed", async ({
    page,
  }) => {
    // Below the md breakpoint the sidebar starts collapsed — the historical
    // partial-export scenario. The export stage alone must supply every
    // slide's DOM.
    await page.setViewportSize({ width: 640, height: 960 });
    await openEditor(page, deckId, "slide-1");
    await expect(page.locator("[data-slide-rail]")).toHaveCount(0);

    const filePath = await downloadViaExportMenu(page, "Export as PDF");
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(10_000);
    expect(fs.readFileSync(filePath).subarray(0, 5).toString()).toBe("%PDF-");

    await expect(page.getByText("Export failed")).not.toBeVisible();
  });

  test("PPTX export contains every slide plus speaker notes", async ({
    page,
  }) => {
    await openEditor(page, deckId, "slide-1");

    const filePath = await downloadViaExportMenu(page, "Export as PPTX");
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));

    for (const part of [
      "ppt/presentation.xml",
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/slide3.xml",
      "ppt/notesSlides/notesSlide1.xml",
      "ppt/notesMasters/notesMaster1.xml",
    ]) {
      expect(zip.file(part), `missing ${part}`).toBeTruthy();
    }

    const notesXml = await zip
      .file("ppt/notesSlides/notesSlide1.xml")!
      .async("string");
    expect(notesXml).toContain("First slide speaker notes");

    await expect(page.getByText("Export failed")).not.toBeVisible();
  });
});

test.describe("social PNG export fidelity", () => {
  let deckId: string;

  test.beforeAll(() => {
    deckId = seedDeck({
      title: "E2E Story Asset",
      kind: "social",
      sizePreset: "ig-story",
      slides: [{ id: "asset-1", content: slideHtml("Story Asset") }],
    });
  });

  test.afterAll(() => {
    if (deckId) deleteDeck(deckId);
  });

  test("PNG downloads at intrinsic canvas size, not thumbnail size", async ({
    page,
  }) => {
    await openEditor(page, deckId, "asset-1");

    const filePath = await downloadViaExportMenu(
      page,
      "Download PNG (current asset)",
    );
    const dims = pngDimensions(fs.readFileSync(filePath));
    // ig-story canvas is 1080×1920, captured at 2x for crisp text.
    expect(dims).toEqual({ width: 2160, height: 3840 });
  });
});
