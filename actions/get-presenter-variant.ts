import { defineAction } from "@agent-native/core";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { getUserSetting } from "@agent-native/core/settings";
import { z } from "zod";

export default defineAction({
  description:
    "Read the user's saved presenter preview style (combo/soft/dim/fade/card), " +
    "or null when they have never set one.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const email = getRequestUserEmail();
    if (!email) return { variant: null };
    const setting = await getUserSetting(email, "presenter");
    const variant =
      typeof setting?.variant === "string" ? setting.variant : null;
    return { variant };
  },
});
