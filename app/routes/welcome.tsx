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
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

/**
 * The landing page at a stable, always-public URL.
 *
 * `/` serves the same page to signed-out visitors, but signed-in users get the
 * workspace there — so this route is what you link to (and what you open in
 * development, where auth is disabled) when you want the landing page itself.
 */
export default function WelcomeRoute() {
  return <Landing />;
}
