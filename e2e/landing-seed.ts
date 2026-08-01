/**
 * Seed data for the landing-page screenshot pipeline
 * (`landing-shots.capture.ts`): a polished demo deck for a fictional coffee
 * brand ("Solstice"), a linked design system, and a social project with
 * assets at several canvas sizes.
 *
 * The deck is deliberately *almost* on brand: slide 7 uses off-palette
 * colors and an off-brand font so the brand-check popover has real,
 * deterministic findings to photograph. Everything is fictional — no real
 * companies, logos, or data.
 */
import { runAction, seedDeck } from "./helpers";

const BRAND = {
  background: "#1C1410",
  surface: "#2A1F18",
  primary: "#E8A25C",
  accent: "#F4C784",
  text: "#F7F1E8",
  muted: "#B8ACA0",
} as const;

const WRAP =
  `padding: 80px 110px; display: flex; flex-direction: column; ` +
  `font-family: 'Poppins', sans-serif; background: ${BRAND.background};`;

function eyebrow(text: string): string {
  return (
    `<div style="font-size: 15px; font-weight: 700; letter-spacing: 3px; ` +
    `text-transform: uppercase; color: ${BRAND.primary}; margin-bottom: 22px;">${text}</div>`
  );
}

function bullet(text: string, size = 22): string {
  return (
    `<div style="display: flex; align-items: flex-start; gap: 16px;">` +
    `<span style="font-size: 8px; color: ${BRAND.accent}; margin-top: 9px; flex-shrink: 0;">&#x25CF;</span>` +
    `<span style="font-size: ${size}px; color: ${BRAND.text}; line-height: 1.5;">${text}</span></div>`
  );
}

function metric(value: string, label: string): string {
  return (
    `<div style="flex: 1;">` +
    `<div style="font-size: 72px; font-weight: 800; color: ${BRAND.primary}; letter-spacing: -2px; line-height: 1;">${value}</div>` +
    `<div style="font-size: 18px; color: ${BRAND.muted}; margin-top: 12px;">${label}</div></div>`
  );
}

const DECK_SLIDES = [
  {
    id: "solstice-title",
    layout: "title",
    content:
      `<div class="fmd-slide" style="${WRAP} justify-content: center;">` +
      eyebrow("Spring launch · 2026") +
      `<h1 style="font-size: 66px; font-weight: 800; color: ${BRAND.text}; line-height: 1.08; letter-spacing: -2px; margin: 0 0 24px 0;">Season two of Solstice.</h1>` +
      `<p style="font-size: 22px; color: ${BRAND.muted}; margin: 0;">Seasonal coffee, roasted to order — direct from six farms.</p></div>`,
  },
  {
    id: "solstice-divider",
    layout: "section",
    content:
      `<div class="fmd-slide" style="${WRAP} justify-content: center;">` +
      eyebrow("01") +
      `<h2 style="font-size: 72px; font-weight: 800; color: ${BRAND.text}; line-height: 1.05; letter-spacing: -2px; margin: 0;">Why now</h2></div>`,
  },
  {
    id: "solstice-context",
    layout: "content",
    content:
      `<div class="fmd-slide" style="${WRAP}">` +
      eyebrow("Why now") +
      `<h2 style="font-size: 40px; font-weight: 800; color: ${BRAND.text}; letter-spacing: -1px; margin: 0 0 48px 0;">Subscriptions have outgrown the roastery</h2>` +
      `<div style="display: flex; flex-direction: column; gap: 20px;">` +
      bullet("Wait-list has held above 2,000 people since November") +
      bullet("Single-origin drops sell out in under six hours") +
      bullet("A second roaster doubles capacity without touching quality") +
      `</div></div>`,
  },
  {
    id: "solstice-metrics",
    layout: "content",
    content:
      `<div class="fmd-slide" style="${WRAP}">` +
      eyebrow("Traction") +
      `<h2 style="font-size: 40px; font-weight: 800; color: ${BRAND.text}; letter-spacing: -1px; margin: 0 0 60px 0;">Early traction</h2>` +
      `<div style="display: flex; gap: 60px;">` +
      metric("12k", "active subscribers") +
      metric("94%", "3-month retention") +
      metric("38", "partner caf&eacute;s") +
      `</div></div>`,
  },
  {
    id: "solstice-drop",
    layout: "content",
    content:
      `<div class="fmd-slide" style="${WRAP}">` +
      eyebrow("The product") +
      `<h2 style="font-size: 40px; font-weight: 800; color: ${BRAND.text}; letter-spacing: -1px; margin: 0 0 40px 0;">The spring drop</h2>` +
      `<div style="display: flex; gap: 60px; flex: 1;">` +
      `<div style="flex: 1; display: flex; flex-direction: column; gap: 20px;">` +
      bullet("Three washed lots from Huila and Sidama", 20) +
      bullet("Roast profiles tuned per lot, not per blend", 20) +
      bullet("Ships within 48 hours of roasting", 20) +
      `</div>` +
      `<div class="fmd-img-placeholder" style="flex: 1; border-radius: 12px; min-height: 300px;">Overhead shot of three spring roast bags on a walnut table</div>` +
      `</div></div>`,
  },
  {
    id: "solstice-quote",
    layout: "content",
    content:
      `<div class="fmd-slide" style="${WRAP} justify-content: center;">` +
      `<div style="width: 60px; height: 4px; background: ${BRAND.primary}; margin-bottom: 40px;"></div>` +
      `<p style="font-size: 46px; font-weight: 700; color: ${BRAND.text}; line-height: 1.25; letter-spacing: -1px; margin: 0 0 32px 0;">&ldquo;The best coffee we&rsquo;ve shipped &mdash; and the first we couldn&rsquo;t keep in stock.&rdquo;</p>` +
      `<p style="font-size: 18px; color: ${BRAND.muted}; margin: 0;">Mika Tanaka &middot; Head roaster</p></div>`,
  },
  {
    // Deliberately off brand: cyan + hot pink literals and a Georgia heading,
    // so lint-deck-brand reports real findings for the brand-check shot.
    id: "solstice-offbrand",
    layout: "content",
    content:
      `<div class="fmd-slide" style="${WRAP}">` +
      `<div style="font-size: 15px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #00E5FF; margin-bottom: 22px;">Campaign</div>` +
      `<h2 style="font-size: 40px; font-weight: 800; color: ${BRAND.text}; letter-spacing: -1px; margin: 0 0 48px 0; font-family: Georgia, serif;">Spring campaign teaser</h2>` +
      `<div style="display: flex; flex-direction: column; gap: 20px;">` +
      `<div style="display: flex; align-items: flex-start; gap: 16px;"><span style="font-size: 8px; color: #00E5FF; margin-top: 9px; flex-shrink: 0;">&#x25CF;</span><span style="font-size: 22px; color: ${BRAND.text}; line-height: 1.5;">Teaser film shot at the Sidama washing station</span></div>` +
      `<div style="display: flex; align-items: flex-start; gap: 16px;"><span style="font-size: 8px; color: #FF4D8F; margin-top: 9px; flex-shrink: 0;">&#x25CF;</span><span style="font-size: 22px; color: ${BRAND.text}; line-height: 1.5;">Countdown wall in the three flagship caf&eacute;s</span></div>` +
      `</div></div>`,
  },
  {
    id: "solstice-close",
    layout: "content",
    content:
      `<div class="fmd-slide" style="${WRAP} justify-content: center;">` +
      eyebrow("Get the spring drop") +
      `<h2 style="font-size: 62px; font-weight: 800; color: ${BRAND.text}; line-height: 1.1; letter-spacing: -2px; margin: 0 0 32px 0;">Roasted Thursday.<br/>At your door Saturday.</h2>` +
      `<p style="font-size: 22px; color: ${BRAND.muted}; margin: 0;">solstice.example &middot; @drinksolstice</p></div>`,
  },
];

interface SocialAsset {
  id: string;
  sizePreset: string;
  content: string;
}

function socialCard(
  padding: string,
  titleSize: number,
  title: string,
  sub: string,
): string {
  return (
    `<div class="fmd-slide" style="padding: ${padding}; display: flex; flex-direction: column; justify-content: flex-end; ` +
    `font-family: 'Poppins', sans-serif; background: linear-gradient(160deg, ${BRAND.surface} 0%, ${BRAND.background} 70%);">` +
    `<div style="font-size: 15px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: ${BRAND.primary}; margin-bottom: 18px;">Solstice</div>` +
    `<div style="font-size: ${titleSize}px; font-weight: 800; color: ${BRAND.text}; line-height: 1.1; letter-spacing: -1px;">${title}</div>` +
    `<div style="font-size: 20px; color: ${BRAND.muted}; margin-top: 16px;">${sub}</div></div>`
  );
}

const SOCIAL_ASSETS: SocialAsset[] = [
  {
    id: "social-square",
    sizePreset: "ig-square",
    content: socialCard("72px", 64, "The spring drop is live.", "Three lots. 48 hours from roast to door."),
  },
  {
    id: "social-story",
    sizePreset: "ig-story",
    // Story safe areas: keep type inside the middle band.
    content: socialCard("140px 72px", 76, "Sold out twice.<br/>Back Thursday.", "Set a reminder — link in bio."),
  },
  {
    id: "social-banner",
    sizePreset: "linkedin-banner",
    content: socialCard("48px 72px", 44, "Seasonal coffee, roasted to order.", "Solstice — season two."),
  },
  {
    id: "social-thumb",
    sizePreset: "yt-thumbnail",
    content: socialCard("64px 72px", 58, "Inside the spring roast", "Six farms. Three lots. One profile each."),
  },
];

export interface LandingSeed {
  deckId: string;
  socialId: string;
  designSystemId: string;
}

export function seedLandingDemo(): LandingSeed {
  const dsOutput = runAction("create-design-system", {
    title: "Solstice Brand",
    description: "Demo design system for landing screenshots",
    data: JSON.stringify({
      colors: {
        primary: BRAND.primary,
        secondary: "#8C6A4F",
        accent: BRAND.accent,
        background: BRAND.background,
        surface: BRAND.surface,
        text: BRAND.text,
        textMuted: BRAND.muted,
      },
      typography: {
        headingFont: "Poppins",
        bodyFont: "Inter",
        headingWeight: "800",
        bodyWeight: "400",
      },
    }),
  });
  const dsMatch = dsOutput.match(/\bid: '([^']+)'/);
  if (!dsMatch) {
    throw new Error(`create-design-system output had no id:\n${dsOutput}`);
  }
  const designSystemId = dsMatch[1];

  // Plain titles (no unique suffix): they appear inside the marketing
  // shots, and cleanupLandingDemo removes the decks after capture.
  const deckId = seedDeck({
    title: "Solstice — Spring Launch",
    slides: DECK_SLIDES,
    designSystemId,
  });

  const socialId = seedDeck({
    title: "Solstice — Spring Social",
    kind: "social",
    slides: [],
  });
  for (const asset of SOCIAL_ASSETS) {
    runAction("add-slide", {
      deckId: socialId,
      content: asset.content,
      sizePreset: asset.sizePreset,
    });
  }

  return { deckId, socialId, designSystemId };
}

export function cleanupLandingDemo(seed: LandingSeed): void {
  runAction("delete-deck", { id: seed.deckId });
  runAction("delete-deck", { id: seed.socialId });
  runAction("delete-design-system", { id: seed.designSystemId });
}
