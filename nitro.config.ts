import { defineNitroConfig } from "nitro/config";

// Nitro's serverless build splits every npm package into its own server
// chunk (codeSplitting group per package). @agent-native/core and
// @agent-native/creative-context import each other, so per-package chunks
// form a circular pair whose init order crashes the Vercel function at
// cold start ("ReferenceError: Cannot access '<minified>' before
// initialization"). Grouping all @agent-native packages into ONE chunk
// removes the cycle. This group is prepended to Nitro's defaults (defu
// array merge) and first match wins.
export default defineNitroConfig({
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
