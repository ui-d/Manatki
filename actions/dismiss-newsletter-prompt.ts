import { defineAction } from "@agent-native/core";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { getUserSetting, putUserSetting } from "@agent-native/core/settings";
import { z } from "zod";

export default defineAction({
  description:
    "Permanently dismiss the one-time newsletter opt-in prompt on the decks " +
    "page for the signed-in user.",
  schema: z.object({}),
  agentTool: false,
  run: async () => {
    const email = getRequestUserEmail();
    if (!email) {
      throw new Error(
        "No user in request context — prompt dismissal is a per-user setting.",
      );
    }
    const previous = await getUserSetting(email, "newsletter");
    await putUserSetting(email, "newsletter", {
      ...previous,
      promptDismissedAt: new Date().toISOString(),
    });
    return { promptDismissed: true };
  },
});
