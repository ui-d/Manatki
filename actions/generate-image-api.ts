import { defineAction } from "@agent-native/core";
import { uploadFile } from "@agent-native/core/file-upload";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { resolveAccess } from "@agent-native/core/sharing";
import type { ImageGenResponse } from "@shared/api";
import { z } from "zod";

import { DEFAULT_STYLE_REFERENCE_URLS } from "../shared/api.js";
import {
  cropGuidanceLine,
  planImageAspect,
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
    const res = await fetch(url);
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
  }),
  run: async (args) => {
    const prompt = args.prompt;
    if (!prompt?.trim()) {
      throw new Error("Prompt is required");
    }

    // Target canvas: explicit preset/dims → the slide's own size → none.
    let targetDims: { width: number; height: number } | null = null;
    if (args.sizePreset) {
      const preset = getPresetSize(args.sizePreset);
      if (preset) targetDims = { width: preset.width, height: preset.height };
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
            targetDims = getSlideDims(
              slide as { size?: { width: number; height: number } },
              deck.aspectRatio as never,
            );
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

    const refImages: ReferenceImage[] = [];

    // Load default style reference images
    console.log(
      `[ImageGen] Loading ${DEFAULT_STYLE_REFERENCE_URLS.length} reference image(s)...`,
    );
    const results = await Promise.all(
      DEFAULT_STYLE_REFERENCE_URLS.map(urlToReferenceImage),
    );
    for (const r of results) {
      if (r) refImages.push(r);
    }

    const context =
      slideContent || deckText ? { slideContent, deckText } : undefined;
    const config =
      plan || args.quality
        ? {
            aspectRatio: plan?.aspectRatio,
            size: plan?.imageSize,
            quality: args.quality,
          }
        : undefined;
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
