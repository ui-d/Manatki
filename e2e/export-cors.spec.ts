import http from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "@playwright/test";

import { deleteDeck, seedDeck } from "./helpers";

// 1×1 red pixel.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * H7 — a cross-origin image whose host does not send
 * Access-Control-Allow-Origin renders blank in DOM captures. The export must
 * still complete but the user must see a warning instead of a silent blank.
 */
test.describe("CORS-tainted image export warning", () => {
  let server: http.Server;
  let deckId: string;

  test.beforeAll(async () => {
    // Deliberately CORS-less image host. 127.0.0.1 is a different origin
    // than the app's localhost, so the canvas-tainting rules apply.
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG_BYTES);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;

    deckId = seedDeck({
      title: "E2E CORS Asset",
      kind: "social",
      sizePreset: "ig-square",
      slides: [
        {
          id: "asset-1",
          content:
            `<div class="fmd-slide" style="display:flex;align-items:center;` +
            `justify-content:center;background:#111;color:#fff;">` +
            `<img src="http://127.0.0.1:${port}/pixel.png" ` +
            `style="width:200px;height:200px;" alt="cors probe" />` +
            `<h1>CORS Probe</h1></div>`,
        },
      ],
    });
  });

  test.afterAll(async () => {
    if (deckId) deleteDeck(deckId);
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  test("PNG export completes and surfaces a blank-image warning", async ({
    page,
  }) => {
    await page.goto(`/deck/${deckId}`);
    await expect(
      page.locator(`[data-slide-canvas="asset-1"]`).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Export" }).click();
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page
      .getByRole("menuitem", { name: "Download PNG (current asset)" })
      .click();

    const download = await downloadPromise;
    expect(await download.path()).toBeTruthy();

    await expect(page.getByText("Some images may be blank")).toBeVisible();
  });
});
