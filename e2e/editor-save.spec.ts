import { expect, test } from "@playwright/test";

import { deleteDeck, seedDeck, slideHtml } from "./helpers";

/**
 * Editor save path: a speaker-notes edit must flow through the capped
 * patch-deck granular-op queue and survive a full page reload.
 */
test.describe("editor save path", () => {
  let deckId: string;

  test.beforeAll(() => {
    deckId = seedDeck({
      title: "E2E Save Deck",
      slides: [{ id: "slide-1", content: slideHtml("Save Path") }],
    });
  });

  test.afterAll(() => {
    if (deckId) deleteDeck(deckId);
  });

  test("speaker-notes edit persists through patch-deck and reload", async ({
    page,
  }) => {
    await page.goto(`/deck/${deckId}`);
    await expect(
      page.locator(`[data-slide-canvas="slide-1"]`).first(),
    ).toBeVisible();

    const notesToggle = page.getByRole("button", {
      name: /Speaker Notes — Slide/,
    });
    const notesArea = page.getByPlaceholder("Add speaker notes...");
    if (!(await notesArea.isVisible().catch(() => false))) {
      await notesToggle.click();
    }
    await expect(notesArea).toBeVisible();

    const marker = `e2e-note-${Date.now()}`;
    // fill() does not fire the change events this React 19 controlled
    // textarea needs — type key-by-key instead.
    await notesArea.click();
    await notesArea.pressSequentially(marker);

    await page.waitForResponse(
      (res) => res.url().includes("patch-deck") && res.ok(),
      { timeout: 20_000 },
    );

    await page.reload();
    await expect(
      page.locator(`[data-slide-canvas="slide-1"]`).first(),
    ).toBeVisible();
    const reloadedArea = page.getByPlaceholder("Add speaker notes...");
    if (!(await reloadedArea.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /Speaker Notes — Slide/ }).click();
    }
    await expect(reloadedArea).toHaveValue(new RegExp(marker));
  });
});
