import { marketingHeaders, marketingMeta } from "@/lib/landing-subpages";
import { NewsletterActionPage } from "@/pages/landing/newsletter";

export const headers = marketingHeaders;

export function meta() {
  return [
    ...marketingMeta({
      title: "Confirm your newsletter subscription — Manatki",
      description: "Confirm your Manatki newsletter subscription.",
      path: "/newsletter/confirm",
    }),
    // Token links are personal — keep them out of search indexes.
    { name: "robots", content: "noindex" },
  ];
}

/** Public token landing page — standalone route, see STANDALONE_ROUTES in root.tsx. */
export default function NewsletterConfirmRoute() {
  return <NewsletterActionPage mode="confirm" />;
}
