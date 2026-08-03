import { defineAction } from "@agent-native/core";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { getUserSetting } from "@agent-native/core/settings";
import { z } from "zod";

import { getSubscriber } from "../server/lib/newsletter.js";

export default defineAction({
  description:
    "Read the signed-in user's newsletter subscription state (none/pending/" +
    "subscribed/unsubscribed) and whether they dismissed the opt-in prompt.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  // Consent state is user-facing UI data, not something the agent acts on.
  agentTool: false,
  run: async () => {
    const email = getRequestUserEmail();
    if (!email) {
      return { status: "none", promptDismissed: true, confirmedAt: null };
    }
    const [row, setting] = await Promise.all([
      getSubscriber(email),
      getUserSetting(email, "newsletter"),
    ]);
    return {
      status: row?.status ?? "none",
      promptDismissed: Boolean(setting?.promptDismissedAt),
      confirmedAt: row?.confirmedAt ?? null,
    };
  },
});
