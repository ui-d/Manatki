import { defineAction } from "@agent-native/core";
import { resolveSecret } from "@agent-native/core/server";
import type { GeneratedSlide } from "@shared/api";
import { z } from "zod";

const VALID_LAYOUTS = ["title", "content", "two-column", "image", "blank"];

/** Thrown when neither the user's OpenAI key nor a Gemini fallback exists —
 * the message is shown to the user and must say exactly how to fix it. */
class SlideGenerationKeyMissingError extends Error {
  statusCode = 402;
  constructor() {
    super(
      "No AI key configured for slide generation. Add your OpenAI API key " +
        "in Settings (it is stored encrypted and only used for your decks), " +
        "or set GEMINI_API_KEY on the server.",
    );
    this.name = "SlideGenerationKeyMissingError";
  }
}

function buildPrompt(args: {
  topic: string;
  slideCount: number;
  style?: string;
  includeImages: boolean;
}) {
  const imageInstruction = args.includeImages
    ? `For slides where a visual would enhance the message, set the layout to "image" and provide an "imagePrompt" field with a detailed description of what image to generate. The imagePrompt should describe a professional, high-quality image that supports the slide content. Include imagePrompt for roughly 30-40% of slides (not the title slide).`
    : `Do not include imagePrompt fields.`;

  const styleInstruction = args.style
    ? `The presentation style should be: ${args.style}.`
    : `The presentation should be professional, modern, and visually clean.`;

  return `Generate a ${args.slideCount}-slide presentation about: "${args.topic}"

${styleInstruction}

Return a JSON array of slide objects. Each slide has:
- "content": Markdown content for the slide. Use ## for titles, bullet points, **bold**, *italic* as appropriate. For "image" layout slides, include the image description in markdown like ![description](PLACEHOLDER_IMAGE).
- "layout": One of "title", "content", "two-column", "image", "blank". The first slide should always be "title". Use "two-column" for comparison slides (separate columns with ---). Use "image" for visual slides.
- "notes": Brief speaker notes for the slide.
- "background": Either "bg-[#000000]" for dark slides or omit for default.
${args.includeImages ? '- "imagePrompt": (optional) A detailed prompt to generate an image for this slide. Only for "image" layout slides.' : ""}

Rules:
- First slide must be "title" layout with the main title and subtitle
- Last slide should be a summary or call-to-action
- Content should be concise and presentation-ready (not paragraphs)
- Use bullet points for lists, keep each point brief
- Do not invent factual numbers, metrics, URLs, source attributions, dates, success rates, benchmarks, customer names, or case-study results. Only include concrete factual claims if they are present in the topic/context. If a useful metric is unknown, use qualitative wording, [metric TBD], or clearly label it as a draft assumption.
- ${imageInstruction}

Respond ONLY with valid JSON. No markdown code fences, no explanation. Just the JSON array.`;
}

async function generateWithOpenAI(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI slide generation failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("No response from OpenAI");
  return text;
}

async function generateWithGemini(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
    },
  });
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");
  return text;
}

function parseSlides(text: string): GeneratedSlide[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : parsed.slides || [];
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error("Failed to parse slide content from AI response");
  }
}

export default defineAction({
  description:
    "Legacy helper for the Generate Slides dialog that drafts a whole new deck outline (multiple slides) from a topic. It returns markdown slide drafts, not the app's rendered slide HTML. Agent chat should create decks with create-deck slides: [] plus add-slide HTML instead of this action. Do NOT use this for a request to generate one or more images/image variations for an existing slide — use generate-image-api for that. Uses the requesting user's OPENAI_API_KEY (Settings), falling back to a server-level GEMINI_API_KEY.",
  schema: z.object({
    topic: z.string().describe("Presentation topic"),
    slideCount: z.coerce
      .number()
      .optional()
      .describe("Number of slides to generate (default: 8)"),
    style: z
      .string()
      .optional()
      .describe("Presentation style (e.g. minimal, corporate)"),
    includeImages: z.coerce
      .boolean()
      .optional()
      .describe("Whether to include image prompts (default: true)"),
  }),
  run: async (args) => {
    const topic = args.topic;
    // Cap at 10. Single-shot JSON generation reliably truncates beyond
    // that — the resulting JSON fails to parse and the user sees an
    // error. Larger decks should be assembled with sequential
    // `add-slide` calls from the agent chat instead.
    const slideCount = Math.min(args.slideCount ?? 8, 10);
    const includeImages = args.includeImages !== false;
    const prompt = buildPrompt({
      topic,
      slideCount,
      style: args.style,
      includeImages,
    });

    // BYOK: the user's own OpenAI key (user-scoped, encrypted at rest) is
    // preferred; a server-level Gemini key keeps self-hosted single-user
    // setups working without per-user configuration.
    const openaiKey = await resolveSecret("OPENAI_API_KEY");
    const geminiKey = openaiKey ? null : await resolveSecret("GEMINI_API_KEY");
    if (!openaiKey && !geminiKey) {
      throw new SlideGenerationKeyMissingError();
    }

    const text = openaiKey
      ? await generateWithOpenAI(openaiKey, prompt)
      : await generateWithGemini(geminiKey as string, prompt);

    let slides = parseSlides(text);

    // Validate and sanitize slides
    slides = slides.map((slide) => ({
      content: slide.content || "",
      layout: VALID_LAYOUTS.includes(slide.layout) ? slide.layout : "content",
      notes: slide.notes || "",
      background: slide.background,
      imagePrompt: includeImages ? slide.imagePrompt : undefined,
    }));

    return { slides };
  },
});
