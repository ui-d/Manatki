/**
 * lint-deck-brand — check a deck's slides against its design system.
 *
 * Deterministic (no LLM): flags saturated colors that aren't close to any
 * palette token and font families outside the brand's heading/body stacks,
 * each with a nearest-token suggestion. Run it after generating or editing
 * slides on a brand-linked deck, or when the user asks "is this on brand?".
 * Fix findings with targeted update-slide edits, not full regeneration.
 */
import { defineAction } from "@agent-native/core";
import { resolveAccess } from "@agent-native/core/sharing";
import type { DesignSystemData } from "@shared/api";
import { lintDeckBrand } from "@shared/brand-lint";
import { z } from "zod";

import "../server/db/index.js"; // ensure registerShareableResource runs

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export default defineAction({
  description:
    "Lint a deck's slides against its linked design system (or an explicit " +
    "one): flags off-palette colors and off-brand font families found in " +
    "slide styles, with per-slide occurrence counts and nearest-token " +
    "suggestions. Deterministic string analysis — no content is modified. " +
    "Use after generating or editing slides on a brand-linked deck; fix " +
    "findings with targeted update-slide edits.",
  schema: z.object({
    deckId: z.string().min(1).describe("Deck ID"),
    designSystemId: z
      .string()
      .optional()
      .describe(
        "Design system to lint against; defaults to the deck's linked system",
      ),
  }),
  readOnly: true,
  http: { method: "GET" },
  run: async ({ deckId, designSystemId }) => {
    const deckAccess = await resolveAccess("deck", deckId);
    if (!deckAccess) {
      // 404 rather than 403 so callers can't probe for decks they can't see.
      throw Object.assign(new Error("Deck not found"), { statusCode: 404 });
    }
    const deckData = parseJson(deckAccess.resource.data as string) as {
      slides?: Array<{ id?: string; content?: string }>;
      designSystemId?: string;
    } | null;

    const targetSystemId = designSystemId ?? deckData?.designSystemId;
    if (!targetSystemId) {
      return {
        deckId,
        linted: false,
        reason: "no-design-system",
        message:
          "This deck has no linked design system. Link one with " +
          "apply-design-system, or pass designSystemId explicitly.",
      };
    }

    const systemAccess = await resolveAccess("design-system", targetSystemId);
    if (!systemAccess) {
      return {
        deckId,
        designSystemId: targetSystemId,
        linted: false,
        reason: "design-system-unavailable",
        message:
          "The design system is missing or not accessible to you; the deck " +
          "may hold a dangling link to a deleted system.",
      };
    }

    const tokens = parseJson(
      systemAccess.resource.data as string,
    ) as DesignSystemData | null;
    if (!tokens?.colors) {
      return {
        deckId,
        designSystemId: targetSystemId,
        linted: false,
        reason: "invalid-design-system-data",
        message: "The design system's token data could not be parsed.",
      };
    }

    const slides = Array.isArray(deckData?.slides)
      ? deckData.slides.map((slide) => ({
          id: slide.id,
          content: typeof slide.content === "string" ? slide.content : "",
        }))
      : [];

    const result = lintDeckBrand(slides, tokens);
    return {
      deckId,
      designSystemId: targetSystemId,
      designSystemTitle: systemAccess.resource.title as string,
      linted: true,
      ...result,
    };
  },
});
