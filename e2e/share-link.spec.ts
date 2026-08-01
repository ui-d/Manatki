import { expect, test } from "@playwright/test";

import { deleteDeck, seedDeck, slideHtml } from "./helpers";

/**
 * Snapshot share-link lifecycle against the real server: mint a token,
 * view it from a separate (fresh-cookie) browser context, revoke it, and
 * verify revoked tokens 404 exactly like missing ones.
 *
 * Driven through the HTTP API rather than the Snapshot-link tab because the
 * tab intentionally shows the cloud-upgrade panel on a local dev database.
 */
test.describe("share-link lifecycle", () => {
  let deckId: string;

  test.beforeAll(() => {
    deckId = seedDeck({
      title: "E2E Share Deck",
      slides: [{ id: "slide-1", content: slideHtml("Shared Snapshot") }],
    });
  });

  test.afterAll(() => {
    if (deckId) deleteDeck(deckId);
  });

  test("create, anonymous view, revoke, 404", async ({ page, browser }) => {
    // Establish the auto dev session so API calls are authenticated.
    await page.goto("/");

    const createRes = await page.request.post("/api/share", {
      data: { deck: { id: deckId } },
    });
    expect(createRes.ok()).toBe(true);
    const { shareToken } = (await createRes.json()) as { shareToken: string };
    expect(shareToken).toBeTruthy();

    // The share link must list for the deck admin.
    const listRes = await page.request.get(
      `/api/share?deckId=${encodeURIComponent(deckId)}`,
    );
    expect(listRes.ok()).toBe(true);
    const { links } = (await listRes.json()) as {
      links: Array<{ token: string }>;
    };
    expect(links.some((l) => l.token === shareToken)).toBe(true);

    // A visitor in a fresh context sees the frozen snapshot.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/share/${shareToken}`);
    await expect(anonPage.getByText("Shared Snapshot").first()).toBeVisible();

    // Revoke, then the token must 404 for API and page alike.
    const revokeRes = await page.request.delete(`/api/share/${shareToken}`);
    expect(revokeRes.ok()).toBe(true);

    const goneRes = await page.request.get(`/api/share/${shareToken}`);
    expect(goneRes.status()).toBe(404);

    await anonPage.reload();
    await expect(anonPage.getByText("Shared Snapshot")).not.toBeVisible();
    await anonContext.close();
  });
});
