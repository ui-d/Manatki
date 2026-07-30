import { defineAction } from "@agent-native/core";
import { resolveSecret } from "@agent-native/core/server";
import { z } from "zod";

export default defineAction({
  description:
    "Check which image generation providers are configured (Gemini/OpenAI API key status).",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    return {
      gemini: !!(await resolveSecret("GEMINI_API_KEY")),
      openai: !!(await resolveSecret("OPENAI_API_KEY")),
    };
  },
});
