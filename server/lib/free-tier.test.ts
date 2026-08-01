import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@agent-native/core/secrets", () => ({
  readAppSecretMeta: vi.fn(),
}));
vi.mock("@agent-native/core/usage", () => ({
  getUsageSummary: vi.fn(),
}));

import { readAppSecretMeta } from "@agent-native/core/secrets";
import { getUsageSummary } from "@agent-native/core/usage";

import {
  appProvidedLlmEnvKeys,
  assertWithinFreeTierBudget,
  freeTierMonthlyBudgetCents,
  startOfCurrentUtcMonthMs,
} from "./free-tier";

const mockReadMeta = vi.mocked(readAppSecretMeta);
const mockUsage = vi.mocked(getUsageSummary);

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "FREE_TIER_MONTHLY_BUDGET_CENTS",
] as const;
const savedEnv = new Map<string, string | undefined>();

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
}

function usageSummary(totalCents: number) {
  return { totalCents } as Awaited<ReturnType<typeof getUsageSummary>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnv({});
  mockReadMeta.mockResolvedValue(null);
  mockUsage.mockResolvedValue(usageSummary(0));
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
});

describe("appProvidedLlmEnvKeys", () => {
  it("returns only set, non-blank provider keys", () => {
    expect(
      appProvidedLlmEnvKeys({
        ANTHROPIC_API_KEY: "sk-test",
        OPENAI_API_KEY: "  ",
      } as NodeJS.ProcessEnv),
    ).toEqual(["ANTHROPIC_API_KEY"]);
  });
});

describe("freeTierMonthlyBudgetCents", () => {
  it("defaults to 300 cents", () => {
    expect(freeTierMonthlyBudgetCents({} as NodeJS.ProcessEnv)).toBe(300);
  });

  it("reads the env override and floors it", () => {
    expect(
      freeTierMonthlyBudgetCents({
        FREE_TIER_MONTHLY_BUDGET_CENTS: "500.9",
      } as NodeJS.ProcessEnv),
    ).toBe(500);
  });

  it("falls back to the default on garbage or negative values", () => {
    for (const bad of ["abc", "-5", "NaN"]) {
      expect(
        freeTierMonthlyBudgetCents({
          FREE_TIER_MONTHLY_BUDGET_CENTS: bad,
        } as NodeJS.ProcessEnv),
      ).toBe(300);
    }
  });

  it("treats 0 as an explicit value (enforcement off)", () => {
    expect(
      freeTierMonthlyBudgetCents({
        FREE_TIER_MONTHLY_BUDGET_CENTS: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(0);
  });
});

describe("startOfCurrentUtcMonthMs", () => {
  it("returns midnight UTC on the 1st of the given date's month", () => {
    const ms = startOfCurrentUtcMonthMs(new Date("2026-08-15T10:30:00Z"));
    expect(new Date(ms).toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("assertWithinFreeTierBudget", () => {
  const user = { ownerEmail: "user@example.com" };

  it("is a no-op when no app-level LLM env key is set", async () => {
    mockUsage.mockResolvedValue(usageSummary(999_999));
    await expect(assertWithinFreeTierBudget(user)).resolves.toBeUndefined();
    expect(mockUsage).not.toHaveBeenCalled();
  });

  it("allows users under budget", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app" });
    mockUsage.mockResolvedValue(usageSummary(299));
    await expect(assertWithinFreeTierBudget(user)).resolves.toBeUndefined();
  });

  it("throws 402 with a Settings pointer once the budget is exhausted", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app" });
    mockUsage.mockResolvedValue(usageSummary(300));
    await expect(assertWithinFreeTierBudget(user)).rejects.toMatchObject({
      statusCode: 402,
      statusMessage: expect.stringContaining("Settings"),
    });
  });

  it("respects FREE_TIER_MONTHLY_BUDGET_CENTS", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app", FREE_TIER_MONTHLY_BUDGET_CENTS: "1000" });
    mockUsage.mockResolvedValue(usageSummary(999));
    await expect(assertWithinFreeTierBudget(user)).resolves.toBeUndefined();
    mockUsage.mockResolvedValue(usageSummary(1000));
    await expect(assertWithinFreeTierBudget(user)).rejects.toMatchObject({
      statusCode: 402,
    });
  });

  it("disables enforcement when the budget is 0", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app", FREE_TIER_MONTHLY_BUDGET_CENTS: "0" });
    mockUsage.mockResolvedValue(usageSummary(999_999));
    await expect(assertWithinFreeTierBudget(user)).resolves.toBeUndefined();
    expect(mockUsage).not.toHaveBeenCalled();
  });

  it("exempts users who saved their own key for every app-provided provider", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app" });
    mockReadMeta.mockResolvedValue({ last4: "abcd" } as Awaited<
      ReturnType<typeof readAppSecretMeta>
    >);
    mockUsage.mockResolvedValue(usageSummary(999_999));
    await expect(assertWithinFreeTierBudget(user)).resolves.toBeUndefined();
    expect(mockReadMeta).toHaveBeenCalledWith({
      key: "ANTHROPIC_API_KEY",
      scope: "user",
      scopeId: user.ownerEmail,
    });
    expect(mockUsage).not.toHaveBeenCalled();
  });

  it("still enforces when the user's own key covers only one of two app providers", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app", OPENAI_API_KEY: "sk-app-2" });
    mockReadMeta.mockImplementation(async (ref) =>
      ref.key === "OPENAI_API_KEY"
        ? ({ last4: "abcd" } as Awaited<ReturnType<typeof readAppSecretMeta>>)
        : null,
    );
    mockUsage.mockResolvedValue(usageSummary(999_999));
    await expect(assertWithinFreeTierBudget(user)).rejects.toMatchObject({
      statusCode: 402,
    });
  });

  it("skips anonymous requests and internal continuations", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app" });
    mockUsage.mockResolvedValue(usageSummary(999_999));
    await expect(
      assertWithinFreeTierBudget({ ownerEmail: null }),
    ).resolves.toBeUndefined();
    await expect(
      assertWithinFreeTierBudget({ ...user, internalContinuation: true }),
    ).resolves.toBeUndefined();
    expect(mockUsage).not.toHaveBeenCalled();
  });

  it("queries usage from the start of the current UTC month", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-app" });
    await assertWithinFreeTierBudget(user);
    const arg = mockUsage.mock.calls[0]?.[0];
    expect(arg?.ownerEmail).toBe(user.ownerEmail);
    expect(new Date(arg?.sinceMs ?? 0).getUTCDate()).toBe(1);
  });
});
