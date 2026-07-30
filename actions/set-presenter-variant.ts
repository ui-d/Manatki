import { defineAction } from "@agent-native/core";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { getUserSetting, putUserSetting } from "@agent-native/core/settings";
import { z } from "zod";

const VARIANTS = ["combo", "soft", "dim", "fade", "card"] as const;

export default defineAction({
  description:
    "Set the user's presenter preview style — how the upcoming slide is " +
    "treated in the two-pane presenter stage. combo: frosted smaller labelled " +
    "thumbnail sinking into shadow (default); soft: lightly frosted full-size; " +
    "dim: sharp but desaturated; fade: sharp, sinking into shadow; card: " +
    "small sharp labelled thumbnail. The presenter also cycles these with " +
    "the V key.",
  schema: z.object({
    variant: z.enum(VARIANTS).describe("Preview treatment to use"),
  }),
  run: async ({ variant }) => {
    const email = getRequestUserEmail();
    if (!email) {
      throw new Error(
        "No user in request context — presenter variant is a per-user setting.",
      );
    }
    const previous = await getUserSetting(email, "presenter");
    await putUserSetting(email, "presenter", { ...previous, variant });
    return { variant, previous: previous?.variant ?? null };
  },
});
