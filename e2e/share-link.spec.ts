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
      slides: [
        { id: "slide-1", content: slideHtml("Shared Snapshot") },
        { id: "slide-2", content: slideHtml("Second Snapshot Slide") },
      ],
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

    // The share link must list for the deck admin, with zeroed view stats.
    const listRes = await page.request.get(
      `/api/share?deckId=${encodeURIComponent(deckId)}`,
    );
    expect(listRes.ok()).toBe(true);
    const { links } = (await listRes.json()) as {
      links: Array<{
        token: string;
        viewCount: number;
        uniqueSessions: number;
      }>;
    };
    const listedLink = links.find((l) => l.token === shareToken);
    expect(listedLink).toBeTruthy();
    expect(listedLink?.viewCount).toBe(0);

    // Owner previews carry ?preview=1 and must never count as views.
    const previewContext = await browser.newContext();
    const previewPage = await previewContext.newPage();
    await previewPage.goto(`/share/${shareToken}?preview=1`);
    await expect(
      previewPage.getByText("Shared Snapshot").first(),
    ).toBeVisible();
    await previewPage.waitForTimeout(500);
    await previewContext.close();

    // A visitor in a fresh context sees the frozen snapshot.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/share/${shareToken}`);
    await expect(anonPage.getByText("Shared Snapshot").first()).toBeVisible();

    // The anonymous visit lands as exactly one view from one session —
    // the preview visit above must not have counted.
    await expect
      .poll(
        async () => {
          const res = await page.request.get(
            `/api/share?deckId=${encodeURIComponent(deckId)}`,
          );
          const body = (await res.json()) as {
            links: Array<{ token: string; viewCount: number }>;
          };
          return body.links.find((l) => l.token === shareToken)?.viewCount;
        },
        { timeout: 10_000 },
      )
      .toBe(1);

    const statsRes = await page.request.get(
      `/api/share?deckId=${encodeURIComponent(deckId)}`,
    );
    const statsBody = (await statsRes.json()) as {
      links: Array<{
        token: string;
        uniqueSessions: number;
        lastViewedAt: string | null;
      }>;
    };
    const viewedLink = statsBody.links.find((l) => l.token === shareToken);
    expect(viewedLink?.uniqueSessions).toBe(1);
    expect(viewedLink?.lastViewedAt).toBeTruthy();

    // Advancing to the next slide flushes a dwell event for slide 0
    // (dwells under 500ms are dropped as rapid flips, hence the wait).
    await anonPage.waitForTimeout(800);
    const slideEventPost = anonPage.waitForResponse(
      (res) =>
        res.url().includes(`/api/share/${shareToken}/events`) &&
        res.request().method() === "POST" &&
        (res.request().postData() ?? "").includes('"slide"'),
    );
    await anonPage.keyboard.press("ArrowRight");
    await expect(
      anonPage.getByText("Second Snapshot Slide").first(),
    ).toBeVisible();
    expect((await slideEventPost).ok()).toBe(true);

    // The owner-facing stats endpoint aggregates the dwell per slide.
    const linkStatsRes = await page.request.get(
      `/api/share/${shareToken}/stats`,
    );
    expect(linkStatsRes.ok()).toBe(true);
    const linkStats = (await linkStatsRes.json()) as {
      viewCount: number;
      uniqueSessions: number;
      slides: Array<{
        slideIndex: number;
        viewers: number;
        avgDwellMs: number;
      }>;
    };
    expect(linkStats.viewCount).toBe(1);
    expect(linkStats.uniqueSessions).toBe(1);
    const firstSlideStat = linkStats.slides.find((s) => s.slideIndex === 0);
    expect(firstSlideStat?.viewers).toBe(1);
    expect(firstSlideStat?.avgDwellMs).toBeGreaterThanOrEqual(500);

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
