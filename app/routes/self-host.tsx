import { SELF_HOST_PAGE, marketingHeaders, marketingMeta } from "@/lib/landing-subpages";
import { SelfHostPage } from "@/pages/landing/subpages";

export const headers = marketingHeaders;

export function meta() {
  return marketingMeta(SELF_HOST_PAGE.meta);
}

/** Marketing subpage — standalone route, see STANDALONE_ROUTES in root.tsx. */
export default function SelfHostRoute() {
  return <SelfHostPage />;
}
