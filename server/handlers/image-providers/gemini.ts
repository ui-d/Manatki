import { resolveSecret } from "@agent-native/core/server";

import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerationResult,
  ReferenceImage,
} from "./types.js";

// Google retired the "-preview" aliases (shut down 2026-06-25); the GA model
// ids dropped the suffix. Sending the old preview ids 404s every call before
// falling through to gemini-2.5-flash-image.
const GEMINI_IMAGE_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
] as const;

export class GeminiProvider implements ImageProvider {
  name = "gemini";

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async isConfiguredForRequest(): Promise<boolean> {
    return !!(await resolveSecret("GEMINI_API_KEY"));
  }

  async generate(
    prompt: string,
    referenceImages: ReferenceImage[] = [],
    context?: { slideContent?: string; deckText?: string },
    config?: ImageProviderConfig,
  ): Promise<ImageGenerationResult> {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = await resolveSecret("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const client = new GoogleGenAI({ apiKey });

    // Randomly select up to 4 reference images for style matching
    const shuffled = [...referenceImages].sort(() => Math.random() - 0.5);
    const selectedRefs = shuffled.slice(0, 4);
    console.log(
      `[Gemini] Using ${selectedRefs.length} of ${referenceImages.length} reference images (randomly selected)`,
    );

    // Build contents with reference images + text prompt
    const contents: any[] = [];
    for (const ref of selectedRefs) {
      contents.push({
        inlineData: {
          mimeType: ref.mimeType,
          data: ref.data,
        },
      });
    }

    if (referenceImages.length > 0) {
      contents.push({
        text: buildStylePrompt(prompt, selectedRefs.length, context, config),
      });
    } else if (config?.mode === "poster" || config?.brandStyle) {
      contents.push({ text: buildBarePrompt(prompt, context, config) });
    } else {
      contents.push({ text: prompt });
    }

    // Build image config from provider config
    const imageConfig: Record<string, string> = {};
    if (config?.size) {
      // Map size hints to Gemini imageSize values
      const sizeMap: Record<string, string> = {
        small: "1K",
        "1k": "1K",
        medium: "2K",
        "2k": "2K",
        large: "4K",
        "4k": "4K",
      };
      const mapped = sizeMap[config.size.toLowerCase()];
      if (mapped) imageConfig.imageSize = mapped;
    }
    if (config?.aspectRatio) {
      imageConfig.aspectRatio = config.aspectRatio;
    }

    let lastError: Error | null = null;
    let usedModel: string = GEMINI_IMAGE_MODELS[0];

    for (const modelName of GEMINI_IMAGE_MODELS) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            const delay = attempt * 3000;
            console.log(
              `[Gemini] Retry ${attempt} for ${modelName} after ${delay}ms`,
            );
            await new Promise((r) => setTimeout(r, delay));
          }
          console.log(
            `[Gemini] Trying model: ${modelName} (attempt ${attempt + 1})`,
          );

          const generateConfig: Record<string, any> = {
            responseModalities: ["TEXT", "IMAGE"],
          };
          if (Object.keys(imageConfig).length > 0) {
            generateConfig.imageConfig = imageConfig;
          }

          const response = await client.models.generateContent({
            model: modelName,
            contents,
            config: generateConfig,
          });

          const parts = response.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData) {
              const buffer = Buffer.from(part.inlineData.data!, "base64");
              console.log(
                `[Gemini] Success with ${modelName} on attempt ${attempt + 1}`,
              );
              usedModel = modelName;
              return {
                imageData: buffer,
                mimeType: part.inlineData.mimeType || "image/png",
                model: usedModel,
                provider: "gemini",
              };
            }
          }
          lastError = new Error(`No image returned from ${modelName}`);
          break;
        } catch (e: any) {
          console.warn(
            `[Gemini] ${modelName} attempt ${attempt + 1} failed: ${e.message}`,
          );
          lastError = e;
          if (isOverloadError(e)) continue;
          break;
        }
      }
      console.log(
        `[Gemini] All retries exhausted for ${modelName}, trying fallback...`,
      );
    }

    throw lastError || new Error("No image returned from Gemini");
  }

  async edit(
    imageData: Buffer,
    prompt: string,
    config?: ImageProviderConfig,
  ): Promise<ImageGenerationResult> {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = await resolveSecret("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const client = new GoogleGenAI({ apiKey });

    const contents = [
      {
        inlineData: {
          mimeType: "image/png",
          data: imageData.toString("base64"),
        },
      },
      {
        text: `Edit this image with the following changes: ${prompt}

Keep everything else about the image the same - same style, same composition, same elements (except what's being changed). Output the edited image.`,
      },
    ];

    const imageConfig: Record<string, string> = {};
    if (config?.aspectRatio) imageConfig.aspectRatio = config.aspectRatio;

    let lastError: Error | null = null;
    for (const modelName of GEMINI_IMAGE_MODELS) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, attempt * 3000));
          }
          console.log(
            `[Gemini] Edit with ${modelName} (attempt ${attempt + 1})`,
          );
          const generateConfig: Record<string, any> = {
            responseModalities: ["TEXT", "IMAGE"],
          };
          if (Object.keys(imageConfig).length > 0) {
            generateConfig.imageConfig = imageConfig;
          }
          const response = await client.models.generateContent({
            model: modelName,
            contents,
            config: generateConfig,
          });
          const parts = response.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData) {
              return {
                imageData: Buffer.from(part.inlineData.data!, "base64"),
                mimeType: part.inlineData.mimeType || "image/png",
                model: modelName,
                provider: "gemini",
              };
            }
          }
          lastError = new Error(`No image returned from ${modelName}`);
          break;
        } catch (e: any) {
          console.warn(
            `[Gemini] ${modelName} edit attempt ${attempt + 1} failed: ${e.message}`,
          );
          lastError = e;
          if (isOverloadError(e)) continue;
          break;
        }
      }
    }
    throw lastError || new Error("No image returned from Gemini edit");
  }
}

function isOverloadError(e: any): boolean {
  return (
    e.status === 429 ||
    e.status === 503 ||
    e.message?.includes("overloaded") ||
    e.message?.includes("503") ||
    e.message?.includes("429") ||
    e.message?.includes("high demand") ||
    e.message?.includes("RESOURCE_EXHAUSTED") ||
    e.message?.includes("UNAVAILABLE")
  );
}

const NON_RENDERABLE_CONTEXT_LIMIT = 700;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/&#x[0-9a-f]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cappedContext(label: string, value?: string): string {
  if (!value) return "";
  const text = stripHtml(value);
  if (!text) return "";
  const capped =
    text.length > NON_RENDERABLE_CONTEXT_LIMIT
      ? `${text.slice(0, NON_RENDERABLE_CONTEXT_LIMIT)}...`
      : text;
  return `\n\n${label} (topic/style context only; do not render these words): ${capped}`;
}

/** The OUTPUT FORMAT block switches on generation mode — keep the branches
 * separate so poster tuning can never regress asset-mode output. */
function outputFormatBlock(config?: ImageProviderConfig): string {
  if (config?.mode === "poster") {
    let block =
      "OUTPUT FORMAT: Generate a complete FULL-CANVAS visual composition that fills the entire frame edge-to-edge — this IS the finished background artwork for the asset, not an element placed into a layout. No slide frame, no presentation border, no mockup chrome around it.";
    if (config.overlayZone && config.overlayZone !== "none") {
      block += ` Keep the ${config.overlayZone} third of the frame visually calm (low detail, low contrast) — headline text will be overlaid there as HTML.`;
    }
    if (config.canvasNotes) {
      block += ` ${config.canvasNotes}`;
    }
    return block;
  }
  return "OUTPUT FORMAT: Generate ONLY the illustration/graphic itself — NOT a slide mockup. Do NOT include any slide frame, presentation border, title text overlay, or slide layout. Just the raw image asset that will be placed INTO a slide.";
}

function textRule(config?: ImageProviderConfig): string {
  if (config?.allowTextInImage) {
    return "- **Render requested text verbatim**: The prompt includes exact text to render inside the image. Spell it exactly as given, letter for letter. Render no other words.";
  }
  return "- **No visible text by default**: Do NOT render words, letters, UI labels, captions, specs, prompt text, or slide copy unless the user's prompt explicitly asks for exact text in the image.";
}

function brandStyleBlock(config?: ImageProviderConfig): string {
  if (!config?.brandStyle) return "";
  return `\n\n${config.brandStyle}`;
}

function buildStylePrompt(
  prompt: string,
  refCount: number,
  context?: { slideContent?: string; deckText?: string },
  config?: ImageProviderConfig,
): string {
  return `You are a world-class visual designer creating assets in a specific visual system. Study the ${refCount} reference images above; they define the target style. Your output must feel indistinguishable from these references.

CRITICAL STYLE RULES (extract these from the references):
- **Exact same color palette**: Match the precise dark backgrounds, accent colors, gradients, and glow effects from the references. Do NOT use different blues, purples, or color schemes.
- **Same rendering technique**: If references use flat UI mockups, create flat UI mockups. If they use 3D renders, use 3D renders. If they use screenshots, create screenshot-style images. MATCH the rendering approach exactly.
- **Same composition style**: Match the spacing, alignment, element sizing, and visual hierarchy from the references.
- **Same visual effects**: Match the exact border styles, shadow depths, corner radii, and transparency levels.
- **NO GLOW**: Do NOT add glow effects, bloom, neon, light halos, or luminous auras. Keep all lighting flat and subtle. No glowing edges, no light emanating from elements, no soft light blooms.
${textRule(config)}
- **Same level of detail**: Don't add more detail or complexity than the references show. Match their level of abstraction.

${outputFormatBlock(config)}${brandStyleBlock(config)}

STYLE MATCH IS THE #1 PRIORITY. If depicting the subject conflicts with matching the style, ALWAYS choose style over subject accuracy.

Subject to depict: ${prompt}

The following context is non-renderable background for topic/style only. Do not copy or display any of this text, HTML, labels, specs, or prompt wording inside the image.${cappedContext("Current slide", context?.slideContent)}${cappedContext("Deck", context?.deckText)}`;
}

/** Poster/brand prompt for the no-reference-images path. */
function buildBarePrompt(
  prompt: string,
  context?: { slideContent?: string; deckText?: string },
  config?: ImageProviderConfig,
): string {
  return `You are a world-class visual designer.

${textRule(config).replace(/^- /, "")}

${outputFormatBlock(config)}${brandStyleBlock(config)}

Subject to depict: ${prompt}

The following context is non-renderable background for topic/style only. Do not copy or display any of this text, HTML, labels, specs, or prompt wording inside the image.${cappedContext("Current slide", context?.slideContent)}${cappedContext("Deck", context?.deckText)}`;
}
