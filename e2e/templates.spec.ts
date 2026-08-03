import { expect, test } from "@playwright/test";

import {
  deleteDeck,
  runAction,
  seedDeck,
  slideHtml,
  uniqueTitle,
} from "./helpers";

/**
 * Template library lifecycle: save-as-template puts a deck under the
 * library's Templates filter (and only there), "Use template" instantiates
 * a working copy with the template flag stripped.
 *
 * Gotcha: the dev DB (PGlite) is per-process — rows created through the dev
 * SERVER (browser flows) are not visible to the `pnpm action` CLI, only the
 * reverse. Assertions and cleanup for browser-created decks must go through
 * the server's own action API (page.request), never runAction.
 */

function extractId(output: string): string {
  const match = output.match(/\bid: '([^']+)'/);
  if (!match) throw new Error(`action output had no id:\n${output}`);
  return match[1];
}

test.describe("template library", () => {
  let sourceId: string;
  let templateId: string;
  const createdDeckIds: string[] = [];
  const sourceTitle = uniqueTitle("E2E Tpl Source");
  const templateTitle = uniqueTitle("E2E Template");

  test.beforeAll(() => {
    sourceId = seedDeck({
      title: sourceTitle,
      kind: "social",
      sizePreset: "ig-square",
      slides: [
        { id: "s1", content: slideHtml("Template Asset One") },
        { id: "s2", content: slideHtml("Template Asset Two", "#0f766e") },
      ],
    });
    templateId = extractId(
      runAction("save-as-template", {
        deckId: sourceId,
        title: templateTitle,
        description: "E2E template description",
      }),
    );
  });

  test.afterAll(async ({ request }) => {
    // CLI-created rows are cleaned via the CLI, browser/server-created rows
    // via the server API (per-process PGlite — see header comment).
    for (const id of [sourceId, templateId]) {
      if (id) deleteDeck(id);
    }
    for (const id of createdDeckIds) {
      await request
        .delete("/_agent-native/actions/delete-deck", { data: { id } })
        .catch(() => {});
    }
  });

  test("template shows only under the Templates filter", async ({ page }) => {
    await page.goto("/");
    // Default library view: source visible, template hidden.
    await expect(page.getByText(sourceTitle).first()).toBeVisible();
    await expect(page.getByText(templateTitle)).toHaveCount(0);

    await page.getByRole("radio", { name: "Templates" }).click();
    await expect(page).toHaveURL(/filter=templates/);
    const card = page.getByText(templateTitle).first();
    await expect(card).toBeVisible();
    await expect(page.getByText(sourceTitle)).toHaveCount(0);
  });

  test("Use template creates a working copy without the flag", async ({
    page,
  }) => {
    // The root path may redirect and drop query params — enter the
    // Templates view through the toggle, like a user would.
    await page.goto("/");
    await page.getByRole("radio", { name: "Templates" }).click();
    await expect(page).toHaveURL(/filter=templates/);
    const card = page
      .locator(".group", { hasText: templateTitle })
      .first();
    await expect(card).toBeVisible();
    await card.hover();
    await card.getByRole("button", { name: "Deck options" }).click();
    await page.getByRole("menuitem", { name: "Use template" }).click();

    await expect(page).toHaveURL(/\/deck\/deck-/, { timeout: 30_000 });
    const newId = page.url().match(/\/deck\/(deck-[^/?#]+)/)?.[1];
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(templateId);
    createdDeckIds.push(newId!);

    // Both template slides came across; the copy is not itself a template.
    const res = await page.request.get(
      `/_agent-native/actions/get-deck?id=${newId}`,
    );
    expect(res.ok()).toBe(true);
    const copy = await res.json();
    expect(copy.slides).toHaveLength(2);
    expect(copy.isTemplate).toBeUndefined();
    expect(copy.templateMeta).toBeUndefined();
  });

  test("editor overflow menu saves the open deck as a template", async ({
    page,
  }) => {
    await page.goto(`/deck/${sourceId}`);
    await expect(
      page.locator('[data-slide-canvas="s1"]').first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Save as template" }).click();
    await expect(page.getByText("Saved as template")).toBeVisible();

    // Find and clean up the template through the server API (the CLI cannot
    // see server-created rows).
    const res = await page.request.get(
      "/_agent-native/actions/list-decks?templates=only&compact=true",
    );
    const listing = await res.json();
    const created = (listing.decks as Array<{ id: string; title: string }>)
      .filter((deck) => deck.title === `${sourceTitle} — Template`)
      .map((deck) => deck.id);
    expect(created).toHaveLength(1);
    createdDeckIds.push(...created);
  });
});
