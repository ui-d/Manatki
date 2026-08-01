import { marketingHeaders, marketingMeta } from "@/lib/landing-subpages";
import Landing from "@/pages/Landing";

export const headers = marketingHeaders;

export function meta() {
  return marketingMeta({
    title: "Manatki — Free, open-source AI studio for decks and campaigns",
    description:
      "A free, open-source studio where an AI agent builds presentations and marketing campaigns with you — on your brand, with your own key. Google Slides, editable PPTX, and per-asset PNG export.",
    path: "/",
  });
}

/**
 * The public home page.
 *
 * `/` is marketing only — it holds no session-dependent content, renders
 * outside the app providers (see `STANDALONE_ROUTES` in `root.tsx`), and is
 * prerendered at build time. The workspace lives at `/decks`; signed-in
 * visitors who land here are forwarded there by `Landing` itself.
 */
export default function IndexRoute() {
  return <Landing />;
}
