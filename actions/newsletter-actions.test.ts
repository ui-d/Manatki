import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import confirmNewsletter from "./confirm-newsletter.js";
import dismissNewsletterPrompt from "./dismiss-newsletter-prompt.js";
import getNewsletterStatus from "./get-newsletter-status.js";
import subscribeNewsletter from "./subscribe-newsletter.js";
import unsubscribeNewsletterByToken from "./unsubscribe-newsletter-by-token.js";
import unsubscribeNewsletter from "./unsubscribe-newsletter.js";

const allActions = {
  "confirm-newsletter": confirmNewsletter,
  "dismiss-newsletter-prompt": dismissNewsletterPrompt,
  "get-newsletter-status": getNewsletterStatus,
  "subscribe-newsletter": subscribeNewsletter,
  "unsubscribe-newsletter": unsubscribeNewsletter,
  "unsubscribe-newsletter-by-token": unsubscribeNewsletterByToken,
};

describe("newsletter action surface", () => {
  it("keeps every newsletter action off the agent tool surface — consent is a user act", () => {
    for (const [name, action] of Object.entries(allActions)) {
      expect(action.agentTool, `${name} must set agentTool: false`).toBe(false);
    }
  });

  it("exposes status as a read-only GET", () => {
    expect(getNewsletterStatus.http).toEqual({ method: "GET" });
    expect(getNewsletterStatus.readOnly).toBe(true);
  });

  it("rejects malformed tokens on the public endpoints", () => {
    for (const action of [confirmNewsletter, unsubscribeNewsletterByToken]) {
      expect(action.schema.safeParse({ token: "short" }).success).toBe(false);
      expect(action.schema.safeParse({ token: "Z".repeat(64) }).success).toBe(
        false,
      );
      expect(action.schema.safeParse({ token: "a".repeat(64) }).success).toBe(
        true,
      );
    }
  });

  it("requires a consent source on subscribe", () => {
    expect(subscribeNewsletter.schema.safeParse({}).success).toBe(false);
    expect(
      subscribeNewsletter.schema.safeParse({ source: "decks-prompt" }).success,
    ).toBe(true);
    expect(
      subscribeNewsletter.schema.safeParse({ source: "agent" }).success,
    ).toBe(false);
  });

  // Regression guard: removing these publicPaths entries silently breaks
  // logged-out unsubscribe/confirm links in already-sent emails (same
  // source-reading style as server/plugins/db.spec.ts).
  it("keeps the token endpoints and newsletter pages public in auth.ts", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const authSource = readFileSync(
      join(here, "../server/plugins/auth.ts"),
      "utf8",
    );
    expect(authSource).toContain('"/newsletter"');
    expect(authSource).toContain('"/_agent-native/actions/confirm-newsletter"');
    expect(authSource).toContain(
      '"/_agent-native/actions/unsubscribe-newsletter-by-token"',
    );
  });
});
