import { describe, expect, it } from "vitest";

import { resolveHomeGate } from "@/hooks/use-home-gate";

/**
 * `/` is two surfaces behind one URL: the public landing page for visitors and
 * the deck workspace for signed-in users. The session only resolves after a
 * network round-trip, so this decision is what stops the wrong one from being
 * painted in the meantime.
 */
describe("resolveHomeGate", () => {
  describe("once the session has resolved", () => {
    it("sends signed-in users to the workspace", () => {
      expect(
        resolveHomeGate({ signedIn: true, isLoading: false, hint: null }),
      ).toBe("app");
    });

    it("sends signed-out visitors to the landing page", () => {
      expect(
        resolveHomeGate({ signedIn: false, isLoading: false, hint: null }),
      ).toBe("landing");
    });

    it("ignores a stale hint that disagrees with the resolved session", () => {
      expect(
        resolveHomeGate({ signedIn: true, isLoading: false, hint: "out" }),
      ).toBe("app");
      expect(
        resolveHomeGate({ signedIn: false, isLoading: false, hint: "in" }),
      ).toBe("landing");
    });
  });

  describe("while the session is still resolving", () => {
    it("paints the workspace for a visitor who was signed in last time", () => {
      expect(
        resolveHomeGate({ signedIn: false, isLoading: true, hint: "in" }),
      ).toBe("app");
    });

    it("paints the landing page for a visitor who was signed out last time", () => {
      expect(
        resolveHomeGate({ signedIn: false, isLoading: true, hint: "out" }),
      ).toBe("landing");
    });

    it("waits rather than guessing when there is no remembered state", () => {
      expect(
        resolveHomeGate({ signedIn: false, isLoading: true, hint: null }),
      ).toBe("pending");
    });
  });
});
