/**
 * Copy for the public landing page.
 *
 * Kept out of the component so the page file stays layout-only, and so this
 * stays the single place to update when the product changes. Intentionally
 * plain English rather than `t()` keys: the app's `i18n` catalogue covers the
 * workspace UI, and machine-translating marketing copy into all twelve locales
 * would ship worse writing than shipping one language well. Localise here when
 * a translated launch is actually planned.
 */

export const GITHUB_URL = "https://github.com/ui-d/Manatki";

export const TAGLINE =
  "An open-source, agent-native studio for presentations and marketing assets. Describe what you need, get a real deck or a full campaign — then edit any slide by hand or by asking.";

/** Example chat instructions shown in the hero, to make "agent-native" concrete. */
export const PROMPT_EXAMPLES = [
  "make a 12-slide deck from this memo, on our brand",
  "add a slide about pricing after the roadmap",
  "make a campaign set for the spring launch",
  "attach these screenshots to slide 3",
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
      "Editable PPTX and HTML export",
    ],
  },
  {
    name: "Social assets",
    kind: 'kind: "social"',
    summary:
      "A set of marketing assets, each on its own pixel canvas at its own size.",
    points: [
      "Instagram posts, stories, banners, ads",
      "Size presets per asset, story safe areas",
      "PNG per asset, or the whole set as a ZIP",
    ],
  },
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
    title: "Bring your own key",
    body: "Add your OpenAI key in Settings. It is stored encrypted, per user, and used only for your generations — the hosted app holds no server-side AI keys.",
  },
  {
    title: "Two-pane presenter",
    body: "The current slide stays sharp on the left while the next one sits treated on the right, in one of five preview styles you cycle mid-talk.",
  },
  {
    title: "Screenshot grids",
    body: "Attach supporting screenshots to any slide. They take over the preview pane as a sharp grid, with click-to-magnify and arrow-key walkthrough.",
  },
  {
    title: "Image decks",
    body: "Drop in a folder of images and it becomes a deck. A subfolder named after a slide becomes that slide's screenshot set.",
  },
  {
    title: "Design systems",
    body: "Build reusable systems from a website, brand document, or code file, then generate on brand by default instead of restyling every deck by hand.",
  },
  {
    title: "Imports and exports",
    body: "Bring in PDF, PPTX, DOCX, or a URL. Send out native editable PPTX, HTML, or PNG — text and shapes stay real, not flattened screenshots.",
  },
  {
    title: "Versions and sharing",
    body: "Version history, comments, and share links, with granular access grants for the people you send a deck to.",
  },
];

export interface PresenterKey {
  keys: readonly string[];
  action: string;
}

export const PRESENTER_KEYS: readonly PresenterKey[] = [
  { keys: ["→", "↓", "Space", "PgDn"], action: "Next slide" },
  { keys: ["←", "↑", "PgUp"], action: "Previous slide" },
  { keys: ["Home", "End"], action: "First / last slide" },
  { keys: ["F"], action: "Fullscreen" },
  { keys: ["V"], action: "Cycle preview style" },
  { keys: ["T"], action: "Presenter timer" },
  { keys: ["Esc"], action: "Close a magnified screenshot" },
];

export const LOCAL_SETUP = ["pnpm install", "pnpm dev"] as const;

export interface DeployRow {
  label: string;
  value: string;
}

export const DEPLOY_STACK: readonly DeployRow[] = [
  { label: "Database", value: "Neon Postgres, or any SQL that Drizzle speaks" },
  { label: "File storage", value: "Vercel Blob, swappable for S3 or R2" },
  { label: "Auth", value: "Better Auth with GitHub OAuth" },
  { label: "AI", value: "None server-side — users bring their own key" },
];
