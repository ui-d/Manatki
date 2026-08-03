import { defineAction } from "@agent-native/core";
import { uploadFile } from "@agent-native/core/file-upload";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { resolveAccess } from "@agent-native/core/sharing";
import type { ImageGenResponse } from "@shared/api";
import { z } from "zod";

import { DEFAULT_STYLE_REFERENCE_URLS } from "../shared/api.js";
import { loadBrandGrounding } from "./_brand-grounding.js";
import {
  cropGuidanceLine,
  planImageAspect,
  safeAreaPromptNote,
  type ImageAspectPlan,
} from "../shared/image-aspect.js";
import {
  getPresetSize,
  getSlideDims,
  isValidSlideDims,
  SIZE_PRESET_VALUES,
} from "../shared/slide-size.js";

import "../server/db/index.js"; // ensure registerShareableResource runs

interface ReferenceImage {
  data: string; // base64
  mimeType: string;
}

async function urlToReferenceImage(
  url: string,
): Promise<ReferenceImage | null> {
  try {
    // SSRF guard: brand reference URLs come from stored design-system data.
    // Block private/internal targets and refuse redirects into them.
    const { isBlockedExtensionUrlWithDns } = await import(
      "@agent-native/core/extensions/url-safety"
    );
    if (await isBlockedExtensionUrlWithDns(url)) {
      console.warn(`[ImageGen] Blocked private/internal reference: ${url}`);
      return null;
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());
    const mimeType = contentType.split(";")[0].trim();
    return { data: buffer.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

export default defineAction({
  description:
    "Generate an image via Gemini or OpenAI, with optional reference images for style matching.",
  schema: z.object({
    prompt: z.string().optional().describe("Image description (required)"),
    model: z
      .string()
      .optional()
      .describe(
        "Provider: 'gemini', 'openai', or 'auto' (default: auto, which prefers gemini, then openai)",
      ),
    sizePreset: z
      .enum(SIZE_PRESET_VALUES)
      .optional()
      .describe(
        "Target canvas preset (e.g. ig-story) — generates at the nearest provider-supported aspect ratio",
      ),
    width: z.number().int().optional().describe("Target canvas width in px"),
    height: z.number().int().optional().describe("Target canvas height in px"),
    deckId: z
      .string()
      .optional()
      .describe("Deck to pull slide context and canvas size from"),
    slideId: z
      .string()
      .optional()
      .describe("Slide whose content and canvas ground the generation"),
    quality: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("OpenAI quality hint"),
    mode: z
      .enum(["asset", "poster"])
      .optional()
      .describe(
        "asset (default): illustration placed into a layout. poster: full-canvas artwork that IS the finished asset background",
      ),
    overlayZone: z
      .enum(["bottom", "top", "center", "none"])
      .optional()
      .describe(
        "Poster-only: where HTML copy will be overlaid — that zone is kept visually calm",
      ),
    allowTextInImage: z
      .boolean()
      .optional()
      .describe(
        "Opt-in: render the prompt's exact text inside the image (not editable or brand-lintable afterwards)",
      ),
    designSystemId: z
      .string()
      .optional()
      .describe(
        "Ground style in this design system (default: deck's linked system, then workspace default)",
      ),
  }),
  run: async (args) => {
    const prompt = args.prompt;
    if (!prompt?.trim()) {
      throw new Error("Prompt is required");
    }

    // Target canvas: explicit preset/dims → the slide's own size → none.
    let targetDims: { width: number; height: number; preset?: string } | null =
      null;
    if (args.sizePreset) {
      const preset = getPresetSize(args.sizePreset);
      if (preset) {
        targetDims = {
          width: preset.width,
          height: preset.height,
          preset: args.sizePreset,
        };
      }
    } else if (args.width != null || args.height != null) {
      if (!isValidSlideDims(args.width, args.height)) {
        throw new Error(
          "width and height must both be integers within canvas bounds",
        );
      }
      targetDims = { width: args.width!, height: args.height! };
    }

    let slideContent: string | undefined;
    let deckText: string | undefined;
    if (args.deckId) {
      const access = await resolveAccess("deck", args.deckId);
      if (!access) {
        // 404 rather than 403 so callers can't probe for decks they can't see.
        throw Object.assign(new Error("Deck not found"), { statusCode: 404 });
      }
      try {
        const deck = JSON.parse(access.resource.data as string) as {
          title?: string;
          aspectRatio?: string;
          slides?: Array<{ id?: string; content?: string; size?: unknown }>;
        };
        const slide = args.slideId
          ? deck.slides?.find((s) => s.id === args.slideId)
          : undefined;
        if (slide) {
          slideContent = slide.content;
          if (!targetDims) {
            const size = slide.size as
              | { width?: number; height?: number; preset?: string }
              | undefined;
            targetDims = {
              ...getSlideDims(
                slide as { size?: { width: number; height: number } },
                deck.aspectRatio as never,
              ),
              preset:
                typeof size?.preset === "string" ? size.preset : undefined,
            };
          }
        }
        deckText = deck.title ? `Deck: ${deck.title}` : undefined;
      } catch {
        // Context extraction is best-effort; generation proceeds without it.
      }
    }

    const plan: ImageAspectPlan | null = targetDims
      ? planImageAspect(targetDims.width, targetDims.height)
      : null;

    // Get the appropriate provider
    const { getProvider } =
      await import("../server/handlers/image-providers/index.js");
    const provider = await getProvider(args.model || "auto");

    // Brand grounding: linked/explicit/default design system contributes a
    // style block and reference image URLs (best-effort, never blocks).
    const brand = await loadBrandGrounding({
      designSystemId: args.designSystemId,
      deckId: args.deckId,
    });

    const refImages: ReferenceImage[] = [];
    const referenceUrls = [
      ...DEFAULT_STYLE_REFERENCE_URLS,
      ...(brand?.referenceImageUrls ?? []),
    ];
    console.log(
      `[ImageGen] Loading ${referenceUrls.length} reference image(s)...`,
    );
    const results = await Promise.all(referenceUrls.map(urlToReferenceImage));
    for (const r of results) {
      if (r) refImages.push(r);
    }

    const context =
      slideContent || deckText ? { slideContent, deckText } : undefined;
    const config = {
      aspectRatio: plan?.aspectRatio,
      size: plan?.imageSize,
      quality: args.quality,
      mode: args.mode ?? "asset",
      overlayZone: args.overlayZone,
      allowTextInImage: args.allowTextInImage,
      canvasNotes: safeAreaPromptNote(targetDims?.preset) || undefined,
      brandStyle: brand?.promptBlock,
    } as const;
    let effectivePrompt = prompt;
    if (plan) {
      const guidance = cropGuidanceLine(
        provider.name === "openai"
          ? Math.max(plan.mismatch, plan.openaiMismatch)
          : plan.mismatch,
      );
      if (guidance) effectivePrompt = `${prompt}\n\n${guidance}`;
    }

    const result = await provider.generate(
      effectivePrompt,
      refImages,
      context,
      config,
    );
    const uploaded = await uploadFile({
      data: result.imageData,
      filename: `slides-generated-${Date.now()}.png`,
      mimeType: result.mimeType,
      ownerEmail: getRequestUserEmail() ?? undefined,
      recordAsset: false,
    });
    if (!uploaded?.url) {
      throw new Error(
        "File storage is not configured. Set up an upload provider (e.g. Vercel Blob via BLOB_READ_WRITE_TOKEN) before generating slide images.",
      );
    }

    const response: ImageGenResponse = {
      url: uploaded.url,
      model: result.model,
      prompt,
    };

    return response;
  },
});
