import { createAuthPlugin } from "@agent-native/core/server";

import { buildLoginHtml } from "../lib/login-page";

export default createAuthPlugin({
  // Full-document replacement (see login-page.ts): the built-in page has no
  // theming seam, and this is the only way to put the sign-in flow on the
  // cobalt-stage design the marketing pages use. Note `loginHtml` supersedes
  // the old `marketing` block entirely.
  loginHtml: buildLoginHtml(),
  publicPaths: [
    "/share",
    "/p",
    "/api/share",
    "/_agent-native/google-docs/callback",
    // React Router's lazy route-discovery endpoint must stay public so
    // unauthenticated viewers can open shared presentation links directly.
    "/__manifest",
  ],
});
