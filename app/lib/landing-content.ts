/**
 * Copy for the public landing page.
 *
 * Kept out of the component so the page file stays layout-only, and so this
 * stays the single place to update when the product changes. Intentionally
 * plain English rather than `t()` keys: the app's `i18n` catalogue covers the
 * workspace UI, and machine-translating marketing copy into all twelve locales
 * would ship worse writing than shipping one language well. Localise here when
 * a translated launch is actually planned.
 *
 * Copy discipline: the product is free and users bring their own OpenAI key,
 * so never promise "unlimited AI" — generation runs at the user's provider
 * prices. The CRM/analytics data angle depends on a connected sibling agent,
 * so it gets one carefully-hedged sentence, never a headline.
 */

export const GITHUB_URL = "https://github.com/ui-d/Manatki";

export const EYEBROW = "Free · Open source · Bring your own key";

export const TAGLINE =
  "Manatki is an open-source studio where an agent turns a memo, a doc, or a sentence into an on-brand deck or a full campaign — editable to the last text box, exportable to PowerPoint and Google Slides.";

/** Example chat instructions shown in the hero, to make "agent-native" concrete. */
export const PROMPT_EXAMPLES = [
  "make a 12-slide deck from this memo, on our brand",
  "add a slide about pricing after the roadmap",
  "make a campaign set for the spring launch",
  "attach these screenshots to slide 3",
  "export this deck to Google Slides",
] as const;

export interface ProjectKind {
  name: string;
  kind: string;
  summary: string;
  points: readonly string[];
}

export const PROJECT_KINDS: readonly ProjectKind[] = [
  {
    name: "Decks",
    kind: 'kind: "deck"',
    summary: "A presentation: one uniform canvas from first slide to last.",
    points: [
      "Talks, pitches, reports, one-pagers",
      "Presenter flow with a two-pane stage",
      "Google Slides, editable PPTX, PDF, and HTML export",
    ],
  },
  {
    name: "Social assets",
    kind: 'kind: "social"',
    summary:
      "A set of marketing assets, each on its own pixel canvas at its own size.",
    points: [
      "16 size presets: posts, stories, banners, ads, thumbnails",
      "Composed per format with story safe areas — not one design stretched to many sizes",
      "PNG per asset, or the whole set as a ZIP",
    ],
  },
];

/** A titled point inside a themed section band. */
export interface SectionPoint {
  title: string;
  body: string;
}

export interface SectionCopy {
  lede: string;
  points: readonly SectionPoint[];
}

export const BRAND_SECTION: SectionCopy = {
  lede: "Point Manatki at a website, brand document, or code file and it becomes a reusable design system — then everything generates on brand by default.",
  points: [
    {
      title: "A brand check that is a linter, not a vibe check",
      body: "Deterministic rules flag off-palette colors and off-brand fonts per slide, with occurrence counts and the nearest on-brand token suggested for each.",
    },
    {
      title: "Fix with AI",
      body: "Confirmed findings hand off to the agent in one click. It restyles the offending slides — no regenerating the whole deck.",
    },
    {
      title: "Workspace defaults",
      body: "Set a default design system once, and a bare “make a deck about X” is already on brand.",
    },
  ],
};

export const SHARE_SECTION: SectionCopy = {
  lede: "Send a share link, then see what landed: views per link, unique viewers, and how long people actually spent on each slide.",
  points: [
    {
      title: "Anonymous by design",
      body: "Viewer sessions are random, client-minted ids. You see engagement — never identity.",
    },
    {
      title: "Per-slide dwell time",
      body: "Total and average time on every slide, so you know where a pitch lands and where it loses people.",
    },
    {
      title: "Built for working together",
      body: "Comments with canvas pins, live presence on the slide you're both editing, and version history with restore.",
    },
  ],
};

export const PRESENT_SECTION: SectionCopy = {
  lede: "The presenter stage is keyboard-first — you should never need to reach for the mouse mid-talk.",
  points: [
    {
      title: "Two-pane stage",
      body: "The current slide stays sharp on the left while the next one sits treated on the right, in one of five preview styles you cycle mid-talk.",
    },
    {
      title: "Screenshot grids",
      body: "Attach supporting screenshots to any slide. They take over the preview pane as a sharp grid, with click-to-magnify and arrow-key walkthrough.",
    },
  ],
};

export interface PresenterKey {
  keys: readonly string[];
  action: string;
}

export const PRESENTER_KEYS: readonly PresenterKey[] = [
  { keys: ["→", "←", "Space"], action: "Next / previous slide" },
  { keys: ["V"], action: "Cycle preview style" },
  { keys: ["F"], action: "Fullscreen" },
  { keys: ["T"], action: "Presenter timer" },
];

export interface Capability {
  title: string;
  body: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    title: "Agentic editing",
    body: "The chat agent has the same access to your project that you do: create, edit, reorder, theme, and illustrate slides from plain language. Nothing is editor-only.",
  },
  {
    title: "A real editor",
    body: "Rich text with slash menus, freeform objects, Excalidraw and Mermaid diagrams, a drawing overlay, speaker notes, undo history, and autosave.",
  },
  {
    title: "Imports",
    body: "Bring in PDF, PPTX, DOCX, Google Docs, code files, or just a URL — Manatki turns them into editable slides, not embedded pictures.",
  },
  {
    title: "Exports",
    body: "Google Slides straight into your Drive, native editable PPTX, PDF, HTML, and PNG. Text and shapes stay real, not flattened screenshots.",
  },
  {
    title: "Image decks",
    body: "Drop in a folder of images and it becomes a deck. A subfolder named after a slide becomes that slide's screenshot set.",
  },
  {
    title: "Decks on your real numbers",
    body: "Connect a sibling analytics agent and decks can cite live CRM and product-usage data, with the source and date window kept as evidence.",
  },
];

export const FREE_SECTION = {
  lede: "Manatki is free. There is no billing code in the repository — no plans page, no seat counter, no card on file.",
  points: [
    {
      title: "Your key",
      body: "You add your own OpenAI key in Settings. It is stored encrypted, scoped to your account, and used only for your own slide and image generation — generation runs at your provider's prices, and the hosted app holds no server-side AI keys.",
    },
    {
      title: "Your data",
      body: "Decks live in your own database and files in your own blob storage when you self-host: Neon Postgres or any SQL that Drizzle speaks, Vercel Blob swappable for S3 or R2, Better Auth with GitHub OAuth.",
    },
  ],
  selfHostNote:
    "MIT-licensed and self-hostable. Locally it runs on SQLite with auth switched off, so you can be editing a deck a minute after cloning — it serves at localhost:8080.",
} as const;

export const LOCAL_SETUP = ["pnpm install", "pnpm dev"] as const;

export const FINAL_CTA = {
  title: "Free, no card, ever.",
  body: "Sign up with GitHub and start with a prompt — or clone the repo and run it on your own infrastructure.",
  secondaryLabel: "or self-host it",
} as const;

/**
 * Product screenshots captured by `e2e/landing-shots.capture.spec.ts`.
 *
 * `src` stays null until the capture pipeline has produced the optimized
 * asset in `public/landing/`; `ScreenshotFrame` renders a skeleton
 * placeholder for null shots so the page never breaks while assets are
 * being regenerated. Width/height are CSS pixels (assets are exported at
 * 2x DPR) and must match the committed files to keep CLS at zero.
 */
export interface ScreenshotShot {
  src: string | null;
  avifSrc: string | null;
  alt: string;
  width: number;
  height: number;
  caption?: string;
}

export const SCREENSHOT_SHOTS = {
  heroEditor: {
    src: "/landing/hero-editor.png",
    avifSrc: "/landing/hero-editor.avif",
    alt: "The Manatki editor with the agent chat rail open beside a slide",
    width: 1440,
    height: 900,
  },
  deckEditor: {
    src: "/landing/deck-editor.png",
    avifSrc: "/landing/deck-editor.avif",
    alt: "A presentation deck open in the Manatki editor",
    width: 1440,
    height: 900,
  },
  socialBoard: {
    src: "/landing/social-board.png",
    avifSrc: "/landing/social-board.avif",
    alt: "A social project with assets at several canvas sizes, from square post to vertical story",
    width: 1440,
    height: 900,
  },
  brandCheck: {
    src: "/landing/brand-check.png",
    avifSrc: "/landing/brand-check.avif",
    alt: "The brand check popover listing off-palette colors with a Fix with AI button",
    width: 1440,
    height: 900,
  },
  presenterStage: {
    src: "/landing/presenter-stage.png",
    avifSrc: "/landing/presenter-stage.avif",
    alt: "The two-pane presenter stage: current slide sharp on the left, treated next-slide preview on the right",
    width: 1440,
    height: 900,
  },
  presenterStageAlt: {
    src: "/landing/presenter-stage-alt.png",
    avifSrc: "/landing/presenter-stage-alt.avif",
    alt: "The presenter stage on a metrics slide, with the following slide previewed to the right",
    width: 1440,
    height: 900,
  },
  shareAnalytics: {
    src: "/landing/share-analytics.png",
    avifSrc: "/landing/share-analytics.avif",
    alt: "Share link analytics showing views, unique viewers, and per-slide time",
    width: 1440,
    height: 900,
  },
} satisfies Record<string, ScreenshotShot>;
