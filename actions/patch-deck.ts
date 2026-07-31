/**
 * patch-deck — granular, server-side read-modify-write for deck fields,
 * individual slides, slide ordering, slide deletion, and slide addition.
 *
 * Two layers keep concurrent writers from overwriting each other:
 * the per-deck promise lock serialises writers inside one Node process, and
 * the `rev` compare-and-swap (`casUpdateDeck` + `retryDeckWrite`) protects
 * against writers on OTHER serverless instances — the lock alone cannot.
 *
 * This action is called by the client editor instead of the old full-deck PUT.
 * Agent actions (update-slide, add-slide, etc.) continue to use their own
 * dedicated actions which share both layers.
 */
import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import {
  getGenerationCreativeContext,
  mergeCreativeContextReuseLabels,
  recordGenerationCreativeContext,
  replaceCreativeContextElementProvenance,
  validateGenerationCreativeContext,
} from "@agent-native/creative-context/server";
import type { CreativeContextReuseLabel } from "@agent-native/creative-context/types";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { normalizeSlidePadding } from "../app/lib/normalize-slide-padding.js";
import { getDb, schema } from "../server/db/index.js";
import { notifyClients } from "../server/handlers/decks.js";
import { createDeckVersionSnapshot } from "../server/lib/deck-versions.js";
import { ASPECT_RATIO_VALUES } from "../shared/aspect-ratios.js";
import {
  MAX_DECK_TITLE_CHARS,
  MAX_SLIDE_ANIMATIONS,
  MAX_SLIDE_BACKGROUND_CHARS,
  MAX_SLIDE_CONTENT_INPUT_CHARS,
  MAX_SLIDE_EXCALIDRAW_CHARS,
  MAX_SLIDE_IMAGE_PROMPT_CHARS,
  MAX_SLIDE_IMAGE_URL_CHARS,
  MAX_SLIDE_NOTES_CHARS,
  MAX_SLIDE_SCREENSHOTS,
} from "../shared/slide-content-limits.js";
import { DECK_KIND_VALUES } from "../shared/slide-size.js";
import {
  casUpdateDeck,
  deckRevOf,
  retryDeckWrite,
  SlideSizeSchema,
} from "./_deck-write.js";
import { prepareSlideContentForPersist } from "./_slide-content.js";

// ---------------------------------------------------------------------------
// Per-deck write lock — same pattern as add-slide.ts so all client and agent
// writes to the same deck are serialised in-process.
// ---------------------------------------------------------------------------
const LOCK_KEY = "__slidesDeckPatchLocks" as const;
type GlobalWithLocks = typeof globalThis & {
  [LOCK_KEY]?: Map<string, Promise<unknown>>;
};
const globalRef = globalThis as GlobalWithLocks;
if (!globalRef[LOCK_KEY]) {
  globalRef[LOCK_KEY] = new Map<string, Promise<unknown>>();
}
const deckLocks: Map<string, Promise<unknown>> = globalRef[LOCK_KEY]!;

export function withDeckLock<T>(
  deckId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = deckLocks.get(deckId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  deckLocks.set(deckId, next);
  next
    .finally(() => {
      if (deckLocks.get(deckId) === next) deckLocks.delete(deckId);
    })
    .catch(() => {});
  return next;
}

// ---------------------------------------------------------------------------
// Operation schemas
// ---------------------------------------------------------------------------

// Size caps (H1): SQL blob rows must stay bounded. Content gets a generous
// input cap because inline images are rewritten to hosted URLs before the
// (much smaller) persist cap applies — see _slide-content.ts.
const SlideFieldsSchema = z.object({
  content: z.string().max(MAX_SLIDE_CONTENT_INPUT_CHARS).optional(),
  notes: z.string().max(MAX_SLIDE_NOTES_CHARS).optional(),
  background: z.string().max(MAX_SLIDE_BACKGROUND_CHARS).optional(),
  layout: z.string().max(100).optional(),
  imageUrl: z.string().max(MAX_SLIDE_IMAGE_URL_CHARS).optional(),
  imageLoading: z.boolean().optional(),
  imagePrompt: z.string().max(MAX_SLIDE_IMAGE_PROMPT_CHARS).optional(),
  excalidrawData: z.string().max(MAX_SLIDE_EXCALIDRAW_CHARS).optional(),
  transition: z.string().max(50).optional(),
  animations: z.array(z.unknown()).max(MAX_SLIDE_ANIMATIONS).optional(),
  kind: z.enum(["html", "image"]).optional(),
  screenshots: z
    .array(z.string().max(MAX_SLIDE_IMAGE_URL_CHARS))
    .max(MAX_SLIDE_SCREENSHOTS)
    .optional(),
  size: SlideSizeSchema.nullable().optional(),
});

/** Update fields on a single existing slide */
const PatchSlideOp = z.object({
  op: z.literal("patch-slide"),
  slideId: z.string(),
  fields: SlideFieldsSchema,
});

/** Delete a single slide by ID */
const DeleteSlideOp = z.object({
  op: z.literal("delete-slide"),
  slideId: z.string(),
  allowEmpty: z.boolean().optional(),
});

/**
 * Reorder slides: send the desired ordered list of slide IDs.
 * Server reorders existing slides to match. Slides not present in the
 * orderedIds list are appended at the end (safe for concurrent adds).
 */
const ReorderSlidesOp = z.object({
  op: z.literal("reorder-slides"),
  orderedIds: z.array(z.string()),
});

/** Add a new slide. slideId must be provided by the client. Unknown keys are
 * stripped (default zod behavior) — applyOperation only ever persisted the
 * listed fields, so the old `.passthrough()` bought nothing but a wider
 * attack surface at the validation layer. */
const AddSlideOp = z.object({
  op: z.literal("add-slide"),
  slideId: z.string(),
  afterSlideId: z.string().optional(), // insert after this slide; append if absent
  fields: z.object({
    content: z.string().max(MAX_SLIDE_CONTENT_INPUT_CHARS),
    notes: z.string().max(MAX_SLIDE_NOTES_CHARS).optional(),
    layout: z.string().max(100).optional(),
    background: z.string().max(MAX_SLIDE_BACKGROUND_CHARS).optional(),
    size: SlideSizeSchema.optional(),
  }),
});

/** Update top-level deck fields (title, designSystemId, tweaks, etc.).
 * `visibility` and `shareToken` are intentionally absent: both were dead
 * writes into the blob (visibility is served from the SQL column, share
 * tokens from deck_share_links). Unknown keys — including those two from
 * older clients — are stripped, not errored. */
const PatchDeckFieldsOp = z.object({
  op: z.literal("patch-deck-fields"),
  fields: z.object({
    title: z.string().max(MAX_DECK_TITLE_CHARS).optional(),
    designSystemId: z.string().nullable().optional(),
    tweaks: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    aspectRatio: z.enum(ASPECT_RATIO_VALUES).optional(),
    kind: z.enum(DECK_KIND_VALUES).optional(),
    defaultSize: SlideSizeSchema.optional(),
    starred: z.boolean().optional(),
  }),
});

export const OperationSchema = z.discriminatedUnion("op", [
  PatchSlideOp,
  DeleteSlideOp,
  ReorderSlidesOp,
  AddSlideOp,
  PatchDeckFieldsOp,
]);

export type Operation = z.infer<typeof OperationSchema>;

const CreativeContextReuseLabelSchema = z.object({
  itemId: z.string().min(1).optional(),
  itemVersionId: z.string().min(1).optional(),
  kind: z.string().min(1),
  label: z.string().min(1),
  dataRole: z.literal("untrusted-reference").default("untrusted-reference"),
  elementId: z.string().min(1).optional(),
  influence: z
    .enum(["reused", "adapted", "reference-conditioned", "generated"])
    .optional(),
});

function storedCreativeContext(value: unknown): {
  contextMode: "off" | "auto" | "pinned";
  contextPackId: string | null;
  reuseLabels: CreativeContextReuseLabel[];
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.contextMode !== "off" &&
    record.contextMode !== "auto" &&
    record.contextMode !== "pinned"
  ) {
    return null;
  }
  return {
    contextMode: record.contextMode,
    contextPackId:
      typeof record.contextPackId === "string" ? record.contextPackId : null,
    reuseLabels: Array.isArray(record.reuseLabels)
      ? (record.reuseLabels as CreativeContextReuseLabel[])
      : [],
  };
}

// ---------------------------------------------------------------------------
// Core merge logic (exported for unit tests)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOperation(deck: any, op: Operation): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slides: any[] = Array.isArray(deck.slides) ? deck.slides : [];

  switch (op.op) {
    case "patch-slide": {
      const idx = slides.findIndex((s: { id: string }) => s.id === op.slideId);
      if (idx === -1) return; // slide was concurrently deleted — ignore
      const slide = slides[idx];
      const fields = op.fields;
      if (fields.content !== undefined) {
        slide.content = normalizeSlidePadding(fields.content);
      }
      if (fields.notes !== undefined) slide.notes = fields.notes;
      if (fields.background !== undefined) slide.background = fields.background;
      if (fields.layout !== undefined) slide.layout = fields.layout;
      if (fields.imageUrl !== undefined) slide.imageUrl = fields.imageUrl;
      if (fields.imageLoading !== undefined)
        slide.imageLoading = fields.imageLoading;
      if (fields.imagePrompt !== undefined)
        slide.imagePrompt = fields.imagePrompt;
      if (fields.excalidrawData !== undefined)
        slide.excalidrawData = fields.excalidrawData;
      if (fields.transition !== undefined) slide.transition = fields.transition;
      if (fields.animations !== undefined) slide.animations = fields.animations;
      if (fields.kind !== undefined) slide.kind = fields.kind;
      if (fields.screenshots !== undefined)
        slide.screenshots = fields.screenshots;
      if (fields.size !== undefined) {
        // null clears the per-slide size back to the deck-level default.
        if (fields.size === null) delete slide.size;
        else slide.size = fields.size;
      }
      break;
    }

    case "delete-slide": {
      const idx = slides.findIndex((s: { id: string }) => s.id === op.slideId);
      if (idx !== -1) slides.splice(idx, 1);
      // Ensure at least one slide remains for direct user deletes. Undoing an
      // add-slide from a legitimately empty deck opts into preserving empty.
      if (slides.length === 0 && !op.allowEmpty) {
        slides.push({
          id: `slide-${Date.now()}-fallback`,
          content: `<div class="fmd-slide" style="padding: 80px 110px; display: flex; flex-direction: column; justify-content: center;"><div style="font-size: 28px; font-weight: 600; color: rgba(255,255,255,0.4);">Double-click to edit</div></div>`,
          notes: "",
          layout: "blank",
        });
      }
      deck.slides = slides;
      break;
    }

    case "reorder-slides": {
      const { orderedIds } = op;
      const byId = new Map(slides.map((s: { id: string }) => [s.id, s]));
      // Build the new order from the client's desired order, keeping only
      // slides that actually exist in the server copy.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reordered: any[] = orderedIds
        .map((id) => byId.get(id))
        .filter(Boolean);
      // Append any slides the server has but the client didn't include in the
      // order list (e.g. a concurrent add from another writer or agent).
      const orderedSet = new Set(orderedIds);
      for (const s of slides) {
        if (!orderedSet.has(s.id)) reordered.push(s);
      }
      deck.slides = reordered;
      break;
    }

    case "add-slide": {
      const { slideId, afterSlideId, fields } = op;
      // Idempotency: if the slide already exists (duplicate delivery), skip.
      if (slides.some((s: { id: string }) => s.id === slideId)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newSlide: any = {
        id: slideId,
        content:
          typeof fields.content === "string"
            ? normalizeSlidePadding(fields.content)
            : "",
        notes: fields.notes ?? "",
        layout: fields.layout ?? "content",
      };
      if (fields.background !== undefined) {
        newSlide.background = fields.background;
      }
      if (fields.size !== undefined) {
        newSlide.size = fields.size;
      }
      const insertAfterIdx = afterSlideId
        ? slides.findIndex((s: { id: string }) => s.id === afterSlideId)
        : -1;
      if (insertAfterIdx !== -1) {
        slides.splice(insertAfterIdx + 1, 0, newSlide);
      } else {
        slides.push(newSlide);
      }
      deck.slides = slides;
      break;
    }

    case "patch-deck-fields": {
      const { fields } = op;
      if (fields.title !== undefined) deck.title = fields.title;
      if ("designSystemId" in fields)
        deck.designSystemId = fields.designSystemId;
      if (fields.tweaks !== undefined) deck.tweaks = fields.tweaks;
      if (fields.aspectRatio !== undefined)
        deck.aspectRatio = fields.aspectRatio;
      if (fields.kind !== undefined) deck.kind = fields.kind;
      if (fields.defaultSize !== undefined)
        deck.defaultSize = fields.defaultSize;
      if (fields.starred !== undefined) deck.starred = fields.starred;
      break;
    }
  }
}

/**
 * Resolve the last operation in a sequence. For example, when typing a new name
 * this will be the latest name of the deck in a sequence of keystrokes.
 */
export function resolveDeckColumnUpdates(
  current: { title: string; designSystemId: string | null },
  operations: Operation[],
): { title: string; designSystemId: string | null } {
  const fieldOps = operations
    .filter(
      (op): op is z.infer<typeof PatchDeckFieldsOp> =>
        op.op === "patch-deck-fields",
    )
    .reverse();
  const titleOp = fieldOps.find((op) => typeof op.fields.title === "string");
  const dsOp = fieldOps.find((op) => "designSystemId" in op.fields);
  return {
    title: titleOp?.fields.title ?? current.title,
    designSystemId: dsOp
      ? (dsOp.fields.designSystemId ?? null)
      : current.designSystemId,
  };
}

// ---------------------------------------------------------------------------
// Action definition
// ---------------------------------------------------------------------------

export default defineAction({
  description:
    "Granular deck patch used by the browser editor for concurrent-safe writes. " +
    "Each operation touches only the target slide or field — concurrent writers " +
    "on different slides never overwrite each other's work.",
  schema: z.object({
    deckId: z.string().describe("Deck ID"),
    operations: z
      .array(OperationSchema)
      .min(1)
      .describe("Ordered list of granular operations to apply"),
    creativeContext: z
      .object({
        contextPackId: z.string().optional(),
        contextModeOverride: z.literal("off").optional(),
        reuseLabels: z
          .array(CreativeContextReuseLabelSchema)
          .optional()
          .default([]),
      })
      .optional()
      .describe(
        "Optional exact Creative Context provenance for context-backed slide patch operations.",
      ),
  }),
  run: async ({ deckId, operations, creativeContext }) => {
    await assertAccess("deck", deckId, "editor");

    // Inline-image rewrite + persist byte cap (H1), BEFORE taking the deck
    // lock so slow uploads never serialize behind other writers.
    for (const op of operations) {
      if (
        (op.op === "patch-slide" || op.op === "add-slide") &&
        typeof op.fields.content === "string"
      ) {
        op.fields.content = await prepareSlideContentForPersist(
          op.fields.content,
        );
      }
    }

    return withDeckLock(deckId, () =>
      retryDeckWrite(deckId, async () => {
        const db = getDb();
        const [row] = await db
          .select()
          .from(schema.decks)
          .where(eq(schema.decks.id, deckId))
          .limit(1);

        if (!row) throw new Error(`Deck ${deckId} not found`);
        const rev = deckRevOf(row);

      // Editor edits flow exclusively through this action, so this is the only
      // place browser typing can enter version history. The 5-minute interval
      // + duplicate suppression inside createDeckVersionSnapshot keep an hour
      // of typing at ~12 snapshots. A snapshot failure must never lose the
      // user's save, so it degrades to a logged warning.
      try {
        await createDeckVersionSnapshot(
          {
            id: row.id,
            title: row.title,
            data: row.data,
            ownerEmail: row.ownerEmail,
          },
          { label: "Before editor edit" },
        );
      } catch (err) {
        console.warn(
          `[patch-deck] version snapshot failed for deck ${deckId}:`,
          err instanceof Error ? err.message : err,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deck: any = JSON.parse(row.data);
      const existingContext = storedCreativeContext(deck.creativeContext);

      for (const op of operations) {
        applyOperation(deck, op);
      }

      const now = new Date().toISOString();
      deck.updatedAt = now;

      const { title: sqlTitle, designSystemId: sqlDesignSystemId } =
        resolveDeckColumnUpdates(
          { title: row.title, designSystemId: row.designSystemId },
          operations,
        );

      let generationRecord:
        | {
            contextMode: "off" | "auto" | "pinned";
            contextPackId: string | null;
            reuseLabels: CreativeContextReuseLabel[];
            elementProvenance: Array<{
              elementId: string;
              influence:
                | "reused"
                | "adapted"
                | "reference-conditioned"
                | "generated";
              itemId?: string;
              itemVersionId?: string;
              label?: string;
            }>;
          }
        | undefined;
      if (creativeContext) {
        const affectedSlideIds = [
          ...new Set(
            operations.flatMap((operation) =>
              operation.op === "patch-slide" || operation.op === "add-slide"
                ? [operation.slideId]
                : [],
            ),
          ),
        ];
        if (!affectedSlideIds.length) {
          throw new Error(
            "Creative Context provenance requires a patch-slide or add-slide operation",
          );
        }
        if (
          existingContext &&
          creativeContext.contextPackId !== undefined &&
          creativeContext.contextPackId !== existingContext.contextPackId
        ) {
          throw new Error(
            "The deck patch must use the deck's existing creative-context pack",
          );
        }
        const effectivePackId =
          creativeContext.contextPackId ?? existingContext?.contextPackId;
        const requestedLabels = affectedSlideIds.flatMap((slideId) => {
          const labels = creativeContext.reuseLabels.filter(
            (label) => !label.elementId || label.elementId === slideId,
          );
          return labels.length
            ? labels.map((label) => ({ ...label, elementId: slideId }))
            : [
                {
                  kind: "slide",
                  label: "Net-new deck patch",
                  dataRole: "untrusted-reference" as const,
                  elementId: slideId,
                  influence: "generated" as const,
                },
              ];
        });
        const validated = await validateGenerationCreativeContext({
          contextPackId: effectivePackId,
          contextPackSource:
            creativeContext.contextPackId === undefined
              ? "inherited"
              : "explicit",
          contextModeOverride: creativeContext.contextModeOverride,
          reuseLabels: requestedLabels,
          reuseLabelsSource: creativeContext.reuseLabels.length
            ? "explicit"
            : "inherited",
        });
        const contextMode =
          validated.contextMode === "off"
            ? "off"
            : (existingContext?.contextMode ?? validated.contextMode);
        const previous =
          contextMode === "off"
            ? null
            : await getGenerationCreativeContext({
                appId: "slides",
                artifactType: "deck",
                artifactId: deckId,
              });
        const nextElementProvenance = validated.reuseLabels.map((label) => ({
          elementId: label.elementId!,
          influence: label.influence ?? ("reference-conditioned" as const),
          ...(label.itemId ? { itemId: label.itemId } : {}),
          ...(label.itemVersionId
            ? { itemVersionId: label.itemVersionId }
            : {}),
          label: label.label,
        }));
        const mergedReuseLabels = mergeCreativeContextReuseLabels(
          existingContext?.reuseLabels ?? [],
          validated.reuseLabels,
        );
        generationRecord = {
          contextMode,
          contextPackId: validated.contextPackId,
          reuseLabels:
            contextMode === "off" ? validated.reuseLabels : mergedReuseLabels,
          elementProvenance:
            contextMode === "off"
              ? nextElementProvenance
              : replaceCreativeContextElementProvenance(
                  previous?.elementProvenance ?? [],
                  nextElementProvenance,
                ),
        };
        if (!(contextMode === "off" && existingContext)) {
          deck.creativeContext = {
            contextMode,
            contextPackId: validated.contextPackId,
            reuseLabels: mergedReuseLabels,
          };
        }
      }

      await db.transaction(async (tx: any) => {
        await casUpdateDeck(tx, deckId, rev, {
          title: sqlTitle,
          data: JSON.stringify(deck),
          designSystemId: sqlDesignSystemId,
          updatedAt: now,
        });
        if (generationRecord) {
          await recordGenerationCreativeContext(
            {
              appId: "slides",
              artifactType: "deck",
              artifactId: deckId,
              ...generationRecord,
            },
            { db: tx },
          );
        }
      });

      notifyClients(deckId);

      return { ok: true, deckId, updatedAt: now };
      }),
    );
  },
});
