import { defineAction } from "@agent-native/core";
import { z } from "zod";

import { syncContactUnsubscribed } from "../server/lib/newsletter-resend-sync.js";
import {
  findByUnsubscribeToken,
  markUnsubscribed,
} from "../server/lib/newsletter.js";

export default defineAction({
  description:
    "Unsubscribe from the newsletter via the token link in an email footer. " +
    "Public endpoint: works with no session so unsubscribing never requires " +
    "login. Idempotent, and never echoes the subscriber's email address.",
  schema: z.object({
    token: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]+$/)
      .describe("Unsubscribe token from the email footer link"),
  }),
  agentTool: false,
  run: async ({ token }) => {
    const row = await findByUnsubscribeToken(token);
    if (!row) return { ok: false, reason: "invalid" };
    if (row.status !== "unsubscribed") {
      await markUnsubscribed(row);
      // Best-effort audience mirror; failure never blocks the unsubscribe.
      await syncContactUnsubscribed(row.email, row.resendContactId);
    }
    return { ok: true };
  },
});
