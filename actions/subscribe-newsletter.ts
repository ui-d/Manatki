import { defineAction } from "@agent-native/core";
import { isEmailConfigured } from "@agent-native/core/server";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import {
  sendConfirmationEmail,
  upsertPending,
} from "../server/lib/newsletter.js";

export default defineAction({
  description:
    "Record the signed-in user's newsletter opt-in consent and send a " +
    "double-opt-in confirmation email. Idempotent: already-subscribed users " +
    "are left untouched; rapid re-requests are throttled.",
  schema: z.object({
    source: z
      .enum(["decks-prompt", "settings"])
      .describe("Which UI surface collected the consent (GDPR audit trail)"),
  }),
  // Consent is a legally meaningful act by the user — never the agent.
  agentTool: false,
  run: async ({ source }) => {
    const email = getRequestUserEmail();
    if (!email) {
      throw new Error(
        "No user in request context — newsletter consent must come from a signed-in user.",
      );
    }
    const { row, shouldSendEmail } = await upsertPending(email, source);
    if (row.status === "subscribed") {
      return { status: "subscribed", emailConfigured: true };
    }
    if (shouldSendEmail) {
      await sendConfirmationEmail(row);
    }
    return {
      status: row.status,
      emailConfigured: await isEmailConfigured(),
    };
  },
});
