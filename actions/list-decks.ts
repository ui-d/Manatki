import { defineAction } from "@agent-native/core";
import { buildDeepLink } from "@agent-native/core/server";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { accessFilter } from "@agent-native/core/sharing";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getDeckUrl } from "./_app-url.js";

function slidesDeepLink(): string {
  return buildDeepLink({ app: "slides", view: "list" });
}

export default defineAction({
  description: "List all decks from the database with metadata.",
  schema: z.object({
    compact: z
      .enum(["true", "false"])
      .optional()
      .describe("Set to 'true' for compact output"),
    includeSlides: z
      .enum(["true", "false"])
      .optional()
      .describe("Set to 'true' for full frontend deck payloads"),
    firstSlideOnly: z
      .enum(["true", "false"])
      .optional()
      .describe(
        "Set to 'true' for frontend deck payloads that carry only the first " +
          "slide of each deck (plus slideCount). The library grid renders " +
          "only slides[0], so this avoids downloading every deck's full " +
          "slide JSON on initial load.",
      ),
    light: z
      .enum(["true", "false"])
      .optional()
      .describe(
        "Set to 'true' for a minimal id/title/updatedAt/visibility listing " +
          "used for cheap add/remove diffing (e.g. background polling). " +
          "Never reads the deck body — no slides, no slideCount.",
      ),
    createdBy: z
      .enum(["all", "me"])
      .optional()
      .describe("Set to 'me' to list only decks created by the current user"),
    templates: z
      .enum(["only", "exclude", "all"])
      .optional()
      .describe(
        "Template filter: 'only' lists saved templates (isTemplate), " +
          "'exclude' hides them, 'all' (default) mixes both. Ignored by the " +
          "light projection, which never reads the deck body.",
      ),
  }),
  http: { method: "GET" },
  link: () => ({
    url: slidesDeepLink(),
    label: "Open decks in Slides",
    view: "list",
  }),
  run: async (args, ctx) => {
    const db = getDb();
    const ownerEmail = getRequestUserEmail();
    if (
      (args.includeSlides === "true" || args.firstSlideOnly === "true") &&
      ctx?.caller === "frontend" &&
      !ownerEmail
    ) {
      const err = new Error("Unauthorized") as Error & { statusCode?: number };
      err.statusCode = 401;
      throw err;
    }

    if (args.createdBy === "me" && !ownerEmail) {
      return { count: 0, decks: [] };
    }

    const visibleDecks = accessFilter(schema.decks, schema.deckShares);
    const where =
      args.createdBy === "me" && ownerEmail
        ? and(visibleDecks, eq(schema.decks.ownerEmail, ownerEmail))
        : visibleDecks;

    if (args.light === "true") {
      // Column-projected listing for cheap add/remove diffing (the client's
      // background poll and SSE-reconnect resync). The `data` column holds
      // each deck's entire slide JSON and can be large — never select it
      // here. Callers that need slide content use `includeSlides: "true"` or
      // fetch the specific deck via `get-deck`.
      const rows = await db
        .select({
          id: schema.decks.id,
          title: schema.decks.title,
          updatedAt: schema.decks.updatedAt,
          visibility: schema.decks.visibility,
        })
        .from(schema.decks)
        .where(where)
        .orderBy(desc(schema.decks.updatedAt));
      return { count: rows.length, decks: rows };
    }

    const rows = await db
      .select()
      .from(schema.decks)
      .where(where)
      .orderBy(desc(schema.decks.updatedAt));

    if (rows.length === 0) {
      return { count: 0, decks: [] };
    }

    const parsed = rows.map((row) => ({ row, data: JSON.parse(row.data) }));
    const filtered =
      args.templates === "only"
        ? parsed.filter(({ data }) => data?.isTemplate === true)
        : args.templates === "exclude"
          ? parsed.filter(({ data }) => data?.isTemplate !== true)
          : parsed;

    const items = filtered.map(({ row, data }) => {
      const slides = data?.slides;
      if (args.includeSlides === "true" || args.firstSlideOnly === "true") {
        const allSlides = Array.isArray(slides) ? slides : [];
        const truncate = args.firstSlideOnly === "true" && allSlides.length > 1;
        return {
          ...data,
          id: row.id,
          title: row.title,
          visibility: row.visibility,
          createdByMe: ownerEmail ? row.ownerEmail === ownerEmail : false,
          designSystemId: row.designSystemId ?? data.designSystemId ?? null,
          createdAt:
            typeof data.createdAt === "string" ? data.createdAt : row.createdAt,
          updatedAt: row.updatedAt,
          previewUrl: row.previewUrl ?? null,
          slides: truncate ? allSlides.slice(0, 1) : allSlides,
          slideCount: allSlides.length,
          // Marks a payload whose slides were truncated to the first slide;
          // the client must full-fetch (get-deck) before editing/presenting.
          ...(truncate ? { partialSlides: true } : {}),
        };
      }

      if (args.compact === "true") {
        return {
          id: row.id,
          title: row.title,
          url: getDeckUrl(row.id),
          slideCount: slides?.length ?? 0,
          visibility: row.visibility,
          designSystemId: row.designSystemId ?? null,
          starred: data?.starred === true,
          ...(data?.isTemplate === true ? { isTemplate: true } : {}),
        };
      }
      return {
        id: row.id,
        title: row.title,
        url: getDeckUrl(row.id),
        slideCount: slides?.length ?? 0,
        visibility: row.visibility,
        designSystemId: row.designSystemId ?? null,
        starred: data?.starred === true,
        ...(data?.isTemplate === true
          ? {
              isTemplate: true,
              templateDescription:
                typeof data?.templateMeta?.description === "string"
                  ? data.templateMeta.description
                  : undefined,
            }
          : {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return { count: items.length, decks: items };
  },
});
