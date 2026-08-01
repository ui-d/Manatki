/**
 * Copy for the marketing subpages (/presentations, /social-assets,
 * /self-host). Same rules as landing-content.ts: plain English on purpose,
 * never promise "unlimited AI", keep claims to what the product ships.
 */
import type { SectionCopy } from "./landing-content";

// Social crawlers need absolute image URLs, and meta() runs on the client
// too, so this is the canonical production origin rather than an env read
// (matches the fallback in actions/_app-url.ts).
export const CANONICAL_ORIGIN = "https://manatki.xyz";

/**
 * Response headers for a marketing route.
 *
 * The framework normally points the Speculation-Rules header at
 * `/_agent-native/speculation-rules.json`, but the react-router dev
 * middleware varies on `sec-fetch-dest` and 404s the browser's native
 * `speculationrules` fetch before nitro can answer, spamming the console on
 * every marketing page. Claiming the header ourselves (the SSR handler
 * preserves an app-provided one) and serving the same no-op ruleset as a
 * static file sidesteps that layer in dev and prod alike.
 */
export function marketingHeaders() {
  return { "Speculation-Rules": '"/speculation-rules.json"' };
}

/** Standard meta tags for a marketing page. */
export function marketingMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const image = `${CANONICAL_ORIGIN}/landing/og.png`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: `${CANONICAL_ORIGIN}${path}` },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

export const PRESENTATIONS_PAGE = {
  meta: {
    title: "Presentations — Manatki, the AI deck studio",
    description:
      "An agent turns a prompt, a document, or a folder of images into an on-brand presentation — editable to the last text box, presented from a keyboard-first two-pane stage.",
    path: "/presentations",
  },
  eyebrow: "Decks",
  title: "From memo to deck to stage.",
  tagline:
    "Start from a prompt, a document, or a folder of images. The agent drafts the deck on your brand; you refine it in a real editor and present it without touching the mouse.",
  start: {
    lede: "Start from anything you already have.",
    points: [
      {
        title: "A sentence",
        body: "“make a 12-slide deck from this memo, on our brand” is a complete instruction — the agent plans the story, writes the slides, and applies your design system.",
      },
      {
        title: "A document",
        body: "PDF, PPTX, DOCX, Google Docs, code files, or a URL come in as editable slides, not embedded pictures of pages.",
      },
      {
        title: "A folder of images",
        body: "Drop it in and it becomes a deck; a subfolder named after a slide becomes that slide's screenshot set for the presenter.",
      },
    ],
  } satisfies SectionCopy,
  presenting: {
    lede: "Presenting is part of the product, not an export step.",
    points: [
      {
        title: "A stage built for talking",
        body: "Your current slide stays razor-sharp while the upcoming one waits softened at its side — glance right to remember what's next, without the audience reading ahead with you.",
      },
      {
        title: "Evidence on tap",
        body: "Slides with attached screenshots swap the preview pane for a browsable grid — magnify a chart mid-question, then arrow back to the talk.",
      },
      {
        title: "Hands on the keyboard",
        body: "Arrows to move, V to restyle the preview live, F for fullscreen, T for the timer. The mouse never has to appear on the projector.",
      },
    ],
  } satisfies SectionCopy,
  exports: {
    lede: "It leaves as a real file, not a screenshot.",
    points: [
      {
        title: "Google Slides",
        body: "Export straight into your Drive as a native Google Slides deck, ready for the people who live there.",
      },
      {
        title: "Editable PPTX",
        body: "Real text boxes and shapes — speaker notes included — so the deck survives the person who insists on PowerPoint.",
      },
      {
        title: "PDF and HTML",
        body: "For attachments and for the web, from the same slides.",
      },
    ],
  } satisfies SectionCopy,
  cta: {
    title: "Talk your next deck into existence.",
    body: "Sign up with GitHub, paste the memo, and watch the outline appear — free, on your own OpenAI key.",
    secondaryLabel: "or self-host it",
  },
} as const;

export const SOCIAL_PAGE = {
  meta: {
    title: "Social assets — Manatki, campaigns in every format",
    description:
      "Ask for a campaign set and every asset composes for its own canvas — Instagram posts, stories, banners, thumbnails, ads — with per-asset PNG export or the whole set as a ZIP.",
    path: "/social-assets",
  },
  eyebrow: "Social projects",
  title: "One campaign, every format.",
  tagline:
    "Ask for a campaign set and each asset is composed for its own pixel canvas — post, story, banner, thumbnail — not one design stretched to sixteen sizes.",
  presets: {
    lede: "Sixteen canvas presets, five families.",
    points: [
      {
        title: "Posts",
        body: "Instagram square and portrait, Facebook, X — 1080×1080 up.",
      },
      {
        title: "Vertical",
        body: "Story and Reel at 1080×1920 with safe areas respected, plus Pinterest pins.",
      },
      {
        title: "Banners",
        body: "LinkedIn, X header, Facebook cover, email header.",
      },
      {
        title: "Web",
        body: "Open Graph link previews and YouTube thumbnails.",
      },
      {
        title: "Ads",
        body: "Medium rectangle, half page, and leaderboard display sizes.",
      },
    ],
  } satisfies SectionCopy,
  composed: {
    lede: "Composed per format, on your brand.",
    points: [
      {
        title: "Format-aware templates",
        body: "A story is laid out as a story and a leaderboard as a leaderboard — each format has its own composition archetype, not a scaled-down copy.",
      },
      {
        title: "Story safe areas",
        body: "Vertical formats keep type inside the band that survives platform chrome and swipe zones.",
      },
      {
        title: "Ship it",
        body: "PNG per asset at intrinsic canvas size, or the whole set as a ZIP. Shared galleries track anonymous per-asset dwell so you know which creative lands.",
      },
    ],
  } satisfies SectionCopy,
  cta: {
    title: "Brief it once. Ship every format.",
    body: "One prompt becomes a campaign set that is actually composed for each canvas — free, with your own key.",
    secondaryLabel: "or self-host it",
  },
} as const;

export const SELF_HOST_PAGE = {
  meta: {
    title: "Self-host Manatki — MIT-licensed AI deck studio",
    description:
      "Clone it, run two commands, and you're editing a deck on SQLite with auth off. Deploy with your own Postgres, blob storage, and OpenAI key — MIT licensed, no strings.",
    path: "/self-host",
  },
  eyebrow: "MIT licensed",
  title: "Yours to run.",
  tagline:
    "Clone it, run two commands, and you're editing a deck on SQLite with auth switched off. Deploy it on your own database, storage, and keys when you're ready.",
  localNote:
    "Serves at localhost:8080 with an automatic dev session — no OAuth setup needed to try it.",
  stack: [
    { label: "Database", value: "Neon Postgres, or any SQL that Drizzle speaks" },
    { label: "File storage", value: "Vercel Blob, swappable for S3 or R2" },
    { label: "Auth", value: "Better Auth with GitHub OAuth" },
    { label: "AI", value: "None server-side — users bring their own key" },
  ],
  keys: {
    lede: "Your keys, your data — hosted or not.",
    points: [
      {
        title: "Bring your own key",
        body: "Each user adds their own OpenAI key, stored encrypted and scoped to their account. Self-hosters can optionally set a shared GEMINI_API_KEY as an image-generation fallback.",
      },
      {
        title: "Nothing leaves your stack",
        body: "Decks live in your database, files in your blob storage, and the server holds no AI credentials of its own.",
      },
    ],
  } satisfies SectionCopy,
  cta: {
    title: "Run it tonight.",
    body: "MIT licensed, no strings attached. Or skip the ops entirely — the hosted studio is free too.",
    secondaryLabel: "Clone the repo",
  },
} as const;
