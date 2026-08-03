import { marketingHeaders, marketingMeta } from "@/lib/landing-subpages";
import { NewsletterActionPage } from "@/pages/landing/newsletter";

export const headers = marketingHeaders;

export function meta() {
  return [
    ...marketingMeta({
      title: "Unsubscribe from the newsletter — Manatki",
      description: "Unsubscribe from the Manatki newsletter.",
      path: "/newsletter/unsubscribe",
    }),
    // Token links are personal — keep them out of search indexes.
    { name: "robots", content: "noindex" },
  ];
}

/** Public token landing page — standalone route, see STANDALONE_ROUTES in root.tsx. */
export default function NewsletterUnsubscribeRoute() {
  return <NewsletterActionPage mode="unsubscribe" />;
}
