import { expect, test } from "@playwright/test";

import { deleteDeck, seedDeck, slideHtml, uniqueTitle } from "./helpers";

test.describe("library", () => {
  let deckId: string;
  const title = uniqueTitle("E2E Library Deck");

  test.beforeAll(() => {
    deckId = seedDeck({
      title,
      slides: [{ id: "slide-1", content: slideHtml("Library Smoke") }],
    });
  });

  test.afterAll(() => {
    if (deckId) deleteDeck(deckId);
  });

  test("home lists seeded deck and opens the editor", async ({ page }) => {
    await page.goto("/");
    const card = page.getByText(title).first();
    await expect(card).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/deck/${deckId}`));
    await expect(
      page.locator(`[data-slide-canvas="slide-1"]`).first(),
    ).toBeVisible();
  });
});
