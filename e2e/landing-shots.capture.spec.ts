/**
 * Landing-page screenshot pipeline. NOT part of the normal E2E suite
 * (playwright.config.ts ignores `*.capture.ts` unless LANDING_SHOTS=1).
 *
 * Run:            pnpm shots:landing
 * Then optimize:  pnpm shots:landing:optimize
 *
 * Captures raw 2x PNGs into public/landing/raw/ from a seeded fictional demo
 * ("Solstice" coffee — see landing-seed.ts). The optimize script recompresses
 * the PNGs and emits AVIF siblings into public/landing/, which is what
 * SCREENSHOT_SHOTS in app/lib/landing-content.ts points at.
 *
 * The share-analytics shot intercepts the env-status and share APIs: the
 * local dev database renders a setup prompt instead of the share tab, and
 * the stats are demo numbers either way. Every other shot is the real app
 * against real seeded data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupLandingDemo,
  seedLandingDemo,
  type LandingSeed,
} from "./landing-seed";

const RAW_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/landing/raw",
);

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

let seed: LandingSeed;

test.beforeAll(() => {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  seed = seedLandingDemo();
});

test.afterAll(() => {
  if (seed) cleanupLandingDemo(seed);
});

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(RAW_DIR, `${name}.png`) });
}

/** Wait until the editor has rendered actual slide content. */
async function waitForEditor(page: Page): Promise<void> {
  await expect(page.locator(".fmd-slide").first()).toBeVisible();
  // Let fonts and thumbnails settle so shots are not mid-paint.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

test("hero editor shot", async ({ page }) => {
  await page.goto(`/deck/${seed.deckId}`);
  await waitForEditor(page);
  // Best-effort: open the agent chat rail if it has a discoverable toggle.
  const chatToggle = page
    .locator(
      '[aria-label*="chat" i], [aria-label*="agent" i], [data-testid*="chat"]',
    )
    .first();
  if (await chatToggle.isVisible().catch(() => false)) {
    await chatToggle.click();
    await page.waitForTimeout(800);
  }
  await shoot(page, "hero-editor");
});

test("deck editor thumbnail shot", async ({ page }) => {
  await page.goto(`/deck/${seed.deckId}`);
  await waitForEditor(page);
  await shoot(page, "deck-editor");
});

test("brand check shot", async ({ page }) => {
  await page.goto(`/deck/${seed.deckId}`);
  await waitForEditor(page);
  await page.getByRole("button", { name: "Brand check" }).click();
  // Lint runs on open; findings from the deliberately off-brand slide.
  await expect(page.getByText("Fix with AI")).toBeVisible();
  await page.waitForTimeout(300);
  await shoot(page, "brand-check");
});

test("presenter stage shot", async ({ page }) => {
  await page.goto(`/deck/${seed.deckId}/present?mode=stage`);
  await expect(page.locator(".fmd-slide").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  // Advance one slide so both panes show real content.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);
  await shoot(page, "presenter-stage");
});

test("presenter stage alt shot", async ({ page }) => {
  // A different slide than the homepage stage shot, so /presentations gets
  // its own visual instead of repeating the same asset.
  await page.goto(`/deck/${seed.deckId}/present?mode=stage&slide=4`);
  await expect(page.locator(".fmd-slide").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await shoot(page, "presenter-stage-alt");
});

test("social board shot", async ({ page }) => {
  await page.goto(`/deck/${seed.socialId}`);
  await waitForEditor(page);
  await shoot(page, "social-board");
});

test("share analytics shot", async ({ page }) => {
  const token = "demo1234567890";
  const linkSummary = {
    token,
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    viewCount: 38,
    uniqueSessions: 21,
    lastViewedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  };
  // The share tab hides behind a database-setup prompt on local SQLite dev,
  // and stats need viewer traffic — fulfill both APIs with demo data.
  await page.route("**/_agent-native/env-status", (route) =>
    route.fulfill({
      json: [
        {
          key: "DATABASE_URL",
          label: "Database",
          required: true,
          configured: true,
        },
      ],
    }),
  );
  await page.route("**/api/share?deckId=*", (route) =>
    route.fulfill({ json: { links: [linkSummary] } }),
  );
  await page.route(`**/api/share/${token}/stats`, (route) =>
    route.fulfill({
      json: {
        ...linkSummary,
        slides: [
          { slideIndex: 0, viewers: 21, totalDwellMs: 214_000, avgDwellMs: 10_190 },
          { slideIndex: 1, viewers: 20, totalDwellMs: 156_000, avgDwellMs: 7_800 },
          { slideIndex: 2, viewers: 19, totalDwellMs: 302_000, avgDwellMs: 15_895 },
          { slideIndex: 3, viewers: 17, totalDwellMs: 401_000, avgDwellMs: 23_588 },
          { slideIndex: 4, viewers: 14, totalDwellMs: 188_000, avgDwellMs: 13_429 },
        ],
      },
    }),
  );

  await page.goto(`/deck/${seed.deckId}`);
  await waitForEditor(page);
  await page.getByRole("button", { name: /share/i }).first().click();
  await page.getByRole("tab", { name: "Snapshot link" }).click();
  await page.getByRole("button", { name: "Slide engagement" }).click();
  await expect(page.getByText(/Slide 4/i)).toBeVisible();
  await page.waitForTimeout(300);
  await shoot(page, "share-analytics");
});

test("og image shot", async ({ browser }) => {
  // Open Graph card: the landing hero at exactly 1200×630, 1x.
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  // Dev auto-session would forward `/` to /decks — block the session
  // lookup so the page renders the anonymous marketing view.
  await page.route("**/_agent-native/**", (route) =>
    route.request().url().includes("session")
      ? route.abort()
      : route.continue(),
  );
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(RAW_DIR, "og.png") });
  await context.close();
});
