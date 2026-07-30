import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveAccess = vi.fn();

vi.mock("@agent-native/core/sharing", () => ({
  resolveAccess: (...args: Parameters<typeof mockResolveAccess>) =>
    mockResolveAccess(...args),
}));

vi.mock("../server/db/index.js", () => ({}));

import action from "./get-design-system.js";

describe("get-design-system", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAccess.mockResolvedValue({
      resource: {
        id: "ds-1",
        title: "Acme Slides",
        description: "Acme presentation system",
        data: JSON.stringify({
          colors: { primary: "#654321", accent: "#00E5FF" },
          typography: { headingFont: "Poppins" },
        }),
        assets: "[]",
        customInstructions: "Use restrained executive presentation layouts.",
        isDefault: false,
        visibility: "private",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
      },
    });
  });

  it("returns token-backed agent context for deck generation", async () => {
    const result = await action.run({ id: "ds-1" });

    expect(result.agentContext).toContain("Selected Design System Context");
    expect(result.agentContext).toContain("#654321");
    expect(result.agentContext).toContain(
      "Use restrained executive presentation layouts.",
    );
    expect(result.customInstructions).toBe(
      "Use restrained executive presentation layouts.",
    );
  });
});
