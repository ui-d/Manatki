import { PRESENTATIONS_PAGE, marketingHeaders, marketingMeta } from "@/lib/landing-subpages";
import { PresentationsPage } from "@/pages/landing/subpages";

export const headers = marketingHeaders;

export function meta() {
  return marketingMeta(PRESENTATIONS_PAGE.meta);
}

/** Marketing subpage — standalone route, see STANDALONE_ROUTES in root.tsx. */
export default function PresentationsRoute() {
  return <PresentationsPage />;
}
