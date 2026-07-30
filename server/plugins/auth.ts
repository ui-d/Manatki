import { createAuthPlugin } from "@agent-native/core/server";

export default createAuthPlugin({
  marketing: {
    appName: "Manatki",
    tagline:
      "Your AI agent crafts presentations and marketing assets alongside you.",
    features: [
      "Generate entire decks or social campaigns from a single prompt",
      "Surgical edits on any slide or asset while you review",
      "Real-time collaboration between you and the agent",
    ],
  },
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
