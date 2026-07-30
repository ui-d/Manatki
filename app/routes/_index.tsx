import Landing from "@/pages/Landing";

const SEO_TITLE =
  "Manatki - Open Source AI studio for presentations and marketing assets";
const SEO_DESCRIPTION =
  "Open Source AI studio for generating, editing, and exporting presentations, social graphics, and marketing assets — on brand, in every format.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
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
