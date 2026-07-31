/**
 * export-asset-images — agent-triggered PNG export for social projects.
 *
 * Rasterization requires a live browser DOM, so this action delegates to an
 * open editor tab through the same application-state round-trip that
 * `_await-fit-check` uses: write a one-shot request, let the editor's
 * PngExportListener render + upload, poll for the hosted-URL result.
 */
import { writeAppState } from "@agent-native/core/application-state";
import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  PNG_EXPORT_REQUEST_KEY,
  PNG_EXPORT_RESULT_KEY,
  isPngExportResult,
  type PngExportRequest,
} from "../shared/png-export.js";
import { getDeckUrl } from "./_app-url.js";
import {
  readAppStateForCurrentTab,
  writeAppStateForCurrentTab,
} from "./_tab-state.js";

const RESULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 400;

export default defineAction({
  description:
    "Export slides/assets as hosted PNG images and return their URLs. " +
    "Requires the deck to be open in a browser editor tab — the editor " +
    "renders each asset at its intrinsic canvas size, uploads the PNGs, " +
    "and this action returns the hosted URLs. Use after generating a " +
    "campaign so the user gets links to every finished asset.",
  schema: z.object({
    deckId: z.string().describe("Deck / social project ID"),
    slideIds: z
      .array(z.string())
      .optional()
      .describe("Specific slide/asset IDs to export; omit for all slides"),
    scale: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("Raster scale multiplier over the canvas size (default 2)"),
  }),
  run: async ({ deckId, slideIds, scale }) => {
    await assertAccess("deck", deckId, "viewer");

    const db = getDb();
    const [row] = await db
      .select({ data: schema.decks.data })
      .from(schema.decks)
      .where(eq(schema.decks.id, deckId))
      .limit(1);
    if (!row) throw new Error(`Deck ${deckId} not found`);

    const deck = JSON.parse(row.data) as {
      slides?: Array<{ id: string }>;
    };
    const slides = Array.isArray(deck.slides) ? deck.slides : [];
    if (slides.length === 0) {
      throw new Error(`Deck ${deckId} has no slides to export`);
    }
    if (slideIds?.length) {
      const known = new Set(slides.map((s) => s.id));
      const missing = slideIds.filter((id) => !known.has(id));
      if (missing.length) {
        throw new Error(
          `Slide id(s) not found in deck ${deckId}: ${missing.join(", ")}. Use get-deck to list slide ids.`,
        );
      }
    }

    const request: PngExportRequest = {
      requestId: `png-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      deckId,
      slideIds: slideIds?.length ? slideIds : null,
      scale: scale ?? 2,
      requestedAt: Date.now(),
    };

    // Write both the tab-scoped key (chat panel next to an open editor) and
    // the global key (CLI / no tab context) so whichever editor tab has this
    // deck open picks the request up.
    await writeAppStateForCurrentTab(
      PNG_EXPORT_REQUEST_KEY,
      request as unknown as Record<string, unknown>,
    );
    await writeAppState(
      PNG_EXPORT_REQUEST_KEY,
      request as unknown as Record<string, unknown>,
    ).catch(() => {
      // Tab-scoped write above already succeeded; the global mirror is
      // best-effort for cross-tab pickup.
    });

    const deadline = Date.now() + RESULT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      let raw: unknown = null;
      try {
        raw = await readAppStateForCurrentTab(PNG_EXPORT_RESULT_KEY);
      } catch {
        break; // no request context (headless) — nothing will ever answer
      }
      if (
        isPngExportResult(raw) &&
        raw.requestId === request.requestId &&
        raw.deckId === deckId
      ) {
        if (raw.status === "error") {
          throw new Error(
            `PNG export failed in the editor: ${raw.error ?? "unknown error"}`,
          );
        }
        return {
          deckId,
          count: raw.images.length,
          images: raw.images,
          message: `Exported ${raw.images.length} PNG${raw.images.length === 1 ? "" : "s"}. Share the URLs with the user.`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(
      `No editor answered the export request. PNG rendering needs the deck open in a browser tab — ask the user to open ${getDeckUrl(deckId)} and retry, or use the editor's Export menu (Download all as ZIP).`,
    );
  },
  link: ({ args }) => {
    const deckId = typeof args.deckId === "string" ? args.deckId : undefined;
    if (!deckId) return null;
    return {
      url: getDeckUrl(deckId),
      label: "Open project in Manatki",
      view: "editor",
    };
  },
});
