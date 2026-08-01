import { defineNitroConfig } from "nitro/config";

// Nitro's serverless build splits every npm package into its own server
// chunk (codeSplitting group per package). @agent-native/core and
// @agent-native/creative-context import each other, so per-package chunks
// form a circular pair whose init order crashes the Vercel function at
// cold start ("ReferenceError: Cannot access '<minified>' before
// initialization"). Grouping all @agent-native packages into ONE chunk
// removes the cycle. This group is prepended to Nitro's defaults (defu
// array merge) and first match wins.
// Defense-in-depth CSP behind the slide-HTML sanitizer
// (app/lib/sanitize-slide-html.ts). Slides legitimately need inline styles
// and remote/data images, and React Router hydration relies on inline
// scripts, so script-src/style-src are not restricted here — that upgrade
// needs nonce plumbing through entry.server. What this DOES block: plugin
// content, <base> hijacking, form exfiltration, and hostile framing of
// shared decks.
const SHARE_PAGE_CSP = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

export default defineNitroConfig({
  routeRules: {
    "/p/**": { headers: { "content-security-policy": SHARE_PAGE_CSP } },
    "/share/**": { headers: { "content-security-policy": SHARE_PAGE_CSP } },
  },
  rolldownConfig: {
    output: {
      codeSplitting: {
        groups: [
          {
            test: /node_modules[/\\]@agent-native[/\\]/,
            name: () => "_libs/agent-native",
          },
        ],
      },
    },
  },
});
