import { SOCIAL_PAGE, marketingHeaders, marketingMeta } from "@/lib/landing-subpages";
import { SocialAssetsPage } from "@/pages/landing/subpages";

export const headers = marketingHeaders;

export function meta() {
  return marketingMeta(SOCIAL_PAGE.meta);
}

/** Marketing subpage — standalone route, see STANDALONE_ROUTES in root.tsx. */
export default function SocialAssetsRoute() {
  return <SocialAssetsPage />;
}
