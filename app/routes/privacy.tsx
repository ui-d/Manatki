import { marketingHeaders, marketingMeta } from "@/lib/landing-subpages";
import { PrivacyPage } from "@/pages/landing/privacy";

export const headers = marketingHeaders;

export function meta() {
  return marketingMeta({
    title: "Privacy policy — Manatki",
    description:
      "What Manatki stores, how newsletter consent works, who processes data on our behalf, and your rights.",
    path: "/privacy",
  });
}

/** Marketing subpage — standalone route, see STANDALONE_ROUTES in root.tsx. */
export default function PrivacyRoute() {
  return <PrivacyPage />;
}
