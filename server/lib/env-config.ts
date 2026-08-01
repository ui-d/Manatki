import type { EnvKeyConfig } from "@agent-native/core/server";

export const envKeys: EnvKeyConfig[] = [
  { key: "DATABASE_URL", label: "Database URL", required: false },
  { key: "DATABASE_AUTH_TOKEN", label: "Database Auth Token", required: false },
  { key: "GEMINI_API_KEY", label: "Gemini AI", required: false },
  { key: "SENTRY_DSN", label: "Sentry DSN", required: false },
];
