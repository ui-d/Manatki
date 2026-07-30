import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  ssr: true,
  routeDiscovery: { mode: "initial" },
  // Do NOT add `prerender: ["/"]` here. The agent-native build writes its own
  // SPA shell as `build/client/index.html`, which then shadows the SSR route
  // for `/` — the home page ends up serving a loading spinner instead of the
  // landing content. `/` is already served from the CDN edge
  // (`cache-control: public, max-age=600, stale-while-revalidate=604800`), so
  // SSR costs nothing per visitor and does emit the full HTML.
} satisfies Config;
