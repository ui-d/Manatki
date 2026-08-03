import { defineAction } from "@agent-native/core";
import { z } from "zod";

import { syncContactSubscribed } from "../server/lib/newsletter-resend-sync.js";
import {
  findByConfirmToken,
  isExpired,
  markConfirmed,
  setResendContactId,
} from "../server/lib/newsletter.js";

export default defineAction({
  description:
    "Complete newsletter double opt-in from the emailed confirmation link. " +
    "Public endpoint: the 256-bit single-use token is the credential; runs " +
    "with no session. Returns error states as data and never echoes the " +
    "subscriber's email address.",
  schema: z.object({
    token: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]+$/)
      .describe("Confirmation token from the emailed link"),
  }),
  agentTool: false,
  run: async ({ token }) => {
    const row = await findByConfirmToken(token);
    if (!row) return { ok: false, reason: "invalid" };
    if (row.status === "subscribed") return { ok: true, already: true };
    if (isExpired(row.confirmTokenExpiresAt)) {
      return { ok: false, reason: "expired" };
    }
    await markConfirmed(row);
    // Best-effort audience mirror; failure never blocks the confirmation.
    const contactId = await syncContactSubscribed(row.email);
    if (contactId) await setResendContactId(row.email, contactId);
    return { ok: true };
  },
});
