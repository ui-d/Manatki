/**
 * Brand grounding for direct-provider image generation.
 *
 * The A2A Images-app path grounds itself in the user's brand library; this
 * helper gives the direct Gemini/OpenAI fallback the same treatment from the
 * linked design system: a compact style prompt block plus reference image
 * URLs. Everything is best-effort — generation must keep working when no
 * design system is reachable, so failures return null instead of throwing.
 */
import type { DesignSystemAsset, DesignSystemData } from "@shared/api";

export interface BrandGrounding {
  designSystemId: string;
  /** Compact BRAND STYLE block for the provider prompt. */
  promptBlock: string;
  /** Hosted image URLs (imagery refs + image assets) for style matching. */
  referenceImageUrls: string[];
}

const MAX_REFERENCE_IMAGES = 4;
const MAX_CUSTOM_INSTRUCTIONS_CHARS = 500;

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Pure assembly from design-system row fields — unit-testable. */
export function buildBrandGrounding(row: {
  id: string;
  data?: string | null;
  assets?: string | null;
  customInstructions?: string | null;
}): BrandGrounding | null {
  const tokens = parseJson(row.data) as DesignSystemData | null;
  if (!tokens?.colors) return null;

  const lines: string[] = ["BRAND STYLE (from the linked design system):"];

  const colorEntries = Object.entries(tokens.colors).filter(
    ([, value]) => typeof value === "string" && value,
  );
  if (colorEntries.length > 0) {
    lines.push(
      `- Palette: ${colorEntries.map(([name, value]) => `${name} ${value}`).join(", ")}. Build the composition from these colors.`,
    );
  }
  const heading = tokens.typography?.headingFont?.split(",")[0]?.trim();
  const body = tokens.typography?.bodyFont?.split(",")[0]?.trim();
  if (heading || body) {
    lines.push(
      `- Typography feel (for mood only — render no text): headings ${heading || "n/a"}, body ${body || "n/a"}.`,
    );
  }
  if (tokens.imageStyle?.styleDescription?.trim()) {
    lines.push(`- Imagery style: ${tokens.imageStyle.styleDescription.trim()}`);
  }
  const custom = row.customInstructions?.trim();
  if (custom) {
    lines.push(
      `- Brand notes: ${custom.length > MAX_CUSTOM_INSTRUCTIONS_CHARS ? `${custom.slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS).trimEnd()}…` : custom}`,
    );
  }

  const referenceImageUrls: string[] = [];
  for (const url of tokens.imageStyle?.referenceUrls ?? []) {
    if (typeof url === "string" && url) referenceImageUrls.push(url);
  }
  const assets = parseJson(row.assets);
  if (Array.isArray(assets)) {
    for (const asset of assets as DesignSystemAsset[]) {
      if (asset?.type === "image" && typeof asset.url === "string") {
        referenceImageUrls.push(asset.url);
      }
    }
  }

  return {
    designSystemId: row.id,
    promptBlock: lines.join("\n"),
    referenceImageUrls: referenceImageUrls.slice(0, MAX_REFERENCE_IMAGES),
  };
}

/**
 * Resolve the grounding source: explicit design system → the deck's linked
 * system → the caller's/workspace default. Returns null when nothing is
 * reachable (unknown ids, no access, no tokens) — callers proceed ungrounded.
 */
export async function loadBrandGrounding(opts: {
  designSystemId?: string;
  deckId?: string;
}): Promise<BrandGrounding | null> {
  try {
    await import("../server/db/index.js"); // ensure registerShareableResource runs
    const { resolveAccess } = await import("@agent-native/core/sharing");

    let systemId = opts.designSystemId;
    if (!systemId && opts.deckId) {
      const deckAccess = await resolveAccess("deck", opts.deckId);
      const deckData = deckAccess
        ? (parseJson(deckAccess.resource.data as string) as {
            designSystemId?: string;
          } | null)
        : null;
      systemId = deckData?.designSystemId ?? undefined;
    }
    if (!systemId) {
      const { getRequestUserEmail } = await import(
        "@agent-native/core/server/request-context"
      );
      const email = getRequestUserEmail();
      if (email) {
        const { resolveDefaultDesignSystemId } = await import(
          "../server/workspace-defaults.js"
        );
        systemId = (await resolveDefaultDesignSystemId(email)) ?? undefined;
      }
    }
    if (!systemId) return null;

    const access = await resolveAccess("design-system", systemId);
    if (!access) return null;
    return buildBrandGrounding({
      id: access.resource.id as string,
      data: access.resource.data as string | null,
      assets: access.resource.assets as string | null,
      customInstructions: access.resource.customInstructions as string | null,
    });
  } catch (err: any) {
    console.warn(
      `[brand-grounding] unavailable, generating ungrounded: ${err?.message ?? err}`,
    );
    return null;
  }
}
