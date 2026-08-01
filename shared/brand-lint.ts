import type { DesignSystemData } from "./api";

/**
 * Deterministic brand linting: compare the colors and fonts a slide's HTML
 * actually uses against a design system's tokens. Regex-based over style
 * attributes and <style> blocks — no DOM dependency, so it runs identically
 * in actions, on the server, and in the browser.
 */

export type BrandLintRule = "off-palette-color" | "off-brand-font";

export interface BrandLintViolation {
  rule: BrandLintRule;
  slideIndex: number;
  slideId: string;
  /** Offending literal, normalized (lowercased, whitespace stripped). */
  value: string;
  /** Times the literal appears in that slide's styles. */
  occurrences: number;
  /** Closest allowed replacement, as a token path plus its value. */
  suggestion: { token: string; value: string } | null;
}

export interface BrandLintResult {
  scannedSlides: number;
  violationCount: number;
  violations: BrandLintViolation[];
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Colors farther than this (red-mean distance, ~0-765 scale) from every
 * palette token are off-brand. Wide enough to absorb rounding and slight
 * tint drift, narrow enough to catch a genuinely foreign hue.
 */
export const COLOR_TOLERANCE = 40;

/**
 * Grays (including white/black and translucent whites) are layout neutrals,
 * not brand colors — anything with channel spread at or under this passes.
 */
const NEUTRAL_CHROMA = 16;

const NAMED_COLORS: Record<string, Rgb> = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
};

/** Parse a CSS color literal to RGB (alpha ignored); null when unparseable. */
export function parseCssColor(value: string): Rgb | null {
  const raw = value.trim().toLowerCase();

  const named = NAMED_COLORS[raw];
  if (named) return { ...named };

  const hex = raw.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: parseInt(digits[0] + digits[0], 16),
        g: parseInt(digits[1] + digits[1], 16),
        b: parseInt(digits[2] + digits[2], 16),
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
      };
    }
    return null;
  }

  const fn = raw.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const nums = parts.slice(0, 3).map((part) => {
    const scaled = part.endsWith("%") ? parseFloat(part) : parseFloat(part);
    return Number.isFinite(scaled)
      ? { value: scaled, pct: part.endsWith("%") }
      : null;
  });
  if (nums.some((n) => n === null)) return null;
  const [a, b, c] = nums as Array<{ value: number; pct: boolean }>;

  if (fn[1].startsWith("rgb")) {
    const to255 = (n: { value: number; pct: boolean }) =>
      Math.round(Math.min(255, Math.max(0, n.pct ? n.value * 2.55 : n.value)));
    return { r: to255(a), g: to255(b), b: to255(c) };
  }

  // hsl(a): hue in degrees, saturation/lightness as percentages.
  const h = ((a.value % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, b.value / 100));
  const l = Math.min(1, Math.max(0, c.value / 100));
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r1, g1, b1] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Red-mean weighted RGB distance — cheap, perceptually decent. */
function colorDistance(a: Rgb, b: Rgb): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db,
  );
}

function isNeutral(color: Rgb): boolean {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max - min <= NEUTRAL_CHROMA;
}

interface PaletteEntry {
  token: string;
  value: string;
  rgb: Rgb;
}

function buildPalette(data: DesignSystemData): PaletteEntry[] {
  const entries: Array<[string, string | undefined]> = [
    ...Object.entries(data.colors ?? {}).map(
      ([key, value]): [string, string | undefined] => [`colors.${key}`, value],
    ),
    ["slideDefaults.background", data.slideDefaults?.background],
  ];
  const palette: PaletteEntry[] = [];
  for (const [token, value] of entries) {
    if (!value) continue;
    const rgb = parseCssColor(value);
    if (rgb) palette.push({ token, value, rgb });
  }
  return palette;
}

/** Everything inside style="..." attributes and <style> blocks. */
function extractStyleText(content: string): string {
  const chunks: string[] = [];
  for (const match of content.matchAll(/style\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    chunks.push(match[2] ?? match[3] ?? "");
  }
  for (const match of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    chunks.push(match[1]);
  }
  return chunks.join("\n");
}

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "inherit",
  "initial",
  "unset",
]);

function splitFamilies(list: string): string[] {
  return list
    .split(",")
    .map((family) => family.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

interface SlideFinding {
  rule: BrandLintRule;
  /** Normalized literal used for dedupe and reporting. */
  value: string;
  suggestion: { token: string; value: string } | null;
}

function findColorViolations(
  styleText: string,
  palette: PaletteEntry[],
): SlideFinding[] {
  const findings: SlideFinding[] = [];
  for (const match of styleText.matchAll(
    /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/gi,
  )) {
    const literal = match[0];
    const rgb = parseCssColor(literal);
    if (!rgb) continue;
    if (isNeutral(rgb)) continue;

    let nearest: PaletteEntry | null = null;
    let nearestDistance = Infinity;
    for (const entry of palette) {
      const distance = colorDistance(rgb, entry.rgb);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = entry;
      }
    }
    if (nearestDistance <= COLOR_TOLERANCE) continue;

    findings.push({
      rule: "off-palette-color",
      value: literal.toLowerCase().replace(/\s+/g, ""),
      suggestion: nearest
        ? { token: nearest.token, value: nearest.value }
        : null,
    });
  }
  return findings;
}

function findFontViolations(
  styleText: string,
  data: DesignSystemData,
): SlideFinding[] {
  const allowed = new Set<string>(GENERIC_FONT_FAMILIES);
  for (const token of [
    data.typography?.headingFont,
    data.typography?.bodyFont,
  ]) {
    for (const family of splitFamilies(token ?? "")) {
      allowed.add(family.toLowerCase());
    }
  }

  const findings: SlideFinding[] = [];
  for (const match of styleText.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const declaration = match[1].trim();
    if (declaration.toLowerCase().startsWith("var(")) continue;
    const families = splitFamilies(declaration);
    const first = families[0];
    if (!first || allowed.has(first.toLowerCase())) continue;

    findings.push({
      rule: "off-brand-font",
      value: first,
      suggestion: data.typography?.bodyFont
        ? { token: "typography.bodyFont", value: data.typography.bodyFont }
        : null,
    });
  }
  return findings;
}

/**
 * Lint every slide's HTML against a design system. Violations are deduped
 * per slide by (rule, literal) with an occurrence count, so one off-brand
 * color used ten times reads as one finding, not ten.
 */
export function lintDeckBrand(
  slides: Array<{ id?: string; content: string }>,
  data: DesignSystemData,
): BrandLintResult {
  const palette = buildPalette(data);
  const violations: BrandLintViolation[] = [];

  slides.forEach((slide, slideIndex) => {
    const styleText = extractStyleText(slide.content ?? "");
    if (!styleText) return;

    const findings = [
      ...findColorViolations(styleText, palette),
      ...findFontViolations(styleText, data),
    ];

    const bySignature = new Map<string, BrandLintViolation>();
    for (const finding of findings) {
      const signature = `${finding.rule}:${finding.value.toLowerCase()}`;
      const existing = bySignature.get(signature);
      if (existing) {
        existing.occurrences += 1;
        continue;
      }
      bySignature.set(signature, {
        rule: finding.rule,
        slideIndex,
        slideId: slide.id ?? `slide-${slideIndex}`,
        value: finding.value,
        occurrences: 1,
        suggestion: finding.suggestion,
      });
    }
    violations.push(...bySignature.values());
  });

  return {
    scannedSlides: slides.length,
    violationCount: violations.length,
    violations,
  };
}
