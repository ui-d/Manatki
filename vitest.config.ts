import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      // `all` plus an explicit include keeps never-imported source files in the
      // denominator — without it the report only measures files some test
      // already reaches, which flatters the number by ~25 points.
      all: true,
      include: ["actions/**", "app/**", "server/**", "shared/**"],
      exclude: [
        "**/*.{test,spec}.?(c|m)[jt]s?(x)",
        "**/*.d.ts",
        "app/i18n/**",
        "server/db/migrations/**",
        ".generated/**",
      ],
      // A ratchet, not the target: set just under the numbers at the time of
      // writing so coverage cannot silently slide backwards. Raise these as
      // areas get covered — the goal is 80%. Only `pnpm test:coverage`
      // enforces them; `pnpm test` is unaffected.
      thresholds: {
        statements: 31,
        branches: 26,
        functions: 26,
        lines: 32,
      },
    },
  },
});
