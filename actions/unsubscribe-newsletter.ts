import { defineAction } from "@agent-native/core";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { syncContactUnsubscribed } from "../server/lib/newsletter-resend-sync.js";
import { getSubscriber, markUnsubscribed } from "../server/lib/newsletter.js";

export default defineAction({
  description:
    "Withdraw the signed-in user's newsletter consent (Settings toggle off). " +
    "Idempotent — a user who was never subscribed is a no-op.",
  schema: z.object({}),
  // Withdrawal of consent is the user's act, not the agent's.
  agentTool: false,
  run: async () => {
    const email = getRequestUserEmail();
    if (!email) {
      throw new Error(
        "No user in request context — unsubscribe from Settings requires a signed-in user.",
      );
    }
    const row = await getSubscriber(email);
    if (!row || row.status === "unsubscribed") {
      return { status: "unsubscribed" };
    }
    await markUnsubscribed(row);
    // Best-effort audience mirror; the table above is the source of truth.
    await syncContactUnsubscribed(row.email, row.resendContactId);
    return { status: "unsubscribed" };
  },
});
