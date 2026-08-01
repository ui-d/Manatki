import { H3, readBody } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@agent-native/core/server", () => ({
  getSession: vi.fn(),
}));
vi.mock("@agent-native/core/secrets", () => ({
  readAppSecretMeta: vi.fn(),
}));
vi.mock("@agent-native/core/usage", () => ({
  getUsageSummary: vi.fn(),
}));

import { readAppSecretMeta } from "@agent-native/core/secrets";
import { getSession } from "@agent-native/core/server";
import { getUsageSummary } from "@agent-native/core/usage";

import freeTierMiddleware from "./free-tier";

const mockSession = vi.mocked(getSession);
const mockReadMeta = vi.mocked(readAppSecretMeta);
const mockUsage = vi.mocked(getUsageSummary);

const ENV_KEYS = ["ANTHROPIC_API_KEY", "FREE_TIER_MONTHLY_BUDGET_CENTS"] as const;
const savedEnv = new Map<string, string | undefined>();

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
}

function buildApp() {
  const app = new H3();
  app.use(freeTierMiddleware);
  app.post("/_agent-native/agent-chat", async (event) => {
    // Downstream handler must still be able to read the body after the
    // middleware's clone-based sniff.
    const body = await readBody(event);
    return { reached: "chat-handler", body };
  });
  app.post("/_agent-native/agent-chat/save-key", () => ({
    reached: "save-key",
  }));
  return app;
}

function post(app: H3, path: string, body: unknown) {
  return app.fetch(
    new Request(`http://local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnv({ ANTHROPIC_API_KEY: "sk-app", FREE_TIER_MONTHLY_BUDGET_CENTS: "300" });
  mockSession.mockResolvedValue({ email: "user@example.com" } as Awaited<
    ReturnType<typeof getSession>
  >);
  mockReadMeta.mockResolvedValue(null);
  mockUsage.mockResolvedValue({ totalCents: 0 } as Awaited<
    ReturnType<typeof getUsageSummary>
  >);
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
});

describe("free-tier middleware", () => {
  it("rejects over-budget users with a 402 and the settings pointer", async () => {
    mockUsage.mockResolvedValue({ totalCents: 300 } as Awaited<
      ReturnType<typeof getUsageSummary>
    >);
    const res = await post(buildApp(), "/_agent-native/agent-chat", {
      message: "hi",
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.errorCode).toBe("free_tier_budget_exhausted");
    expect(body.error).toContain("Settings");
  });

  it("lets under-budget users through with the body intact", async () => {
    const res = await post(buildApp(), "/_agent-native/agent-chat", {
      message: "hi",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reached).toBe("chat-handler");
    expect(body.body).toEqual({ message: "hi" });
  });

  it("never gates subpaths like save-key (the exit from the free tier)", async () => {
    mockUsage.mockResolvedValue({ totalCents: 999_999 } as Awaited<
      ReturnType<typeof getUsageSummary>
    >);
    const res = await post(buildApp(), "/_agent-native/agent-chat/save-key", {});
    expect(res.status).toBe(200);
    expect((await res.json()).reached).toBe("save-key");
  });

  it("lets internal continuations of in-flight runs through", async () => {
    mockUsage.mockResolvedValue({ totalCents: 999_999 } as Awaited<
      ReturnType<typeof getUsageSummary>
    >);
    const res = await post(buildApp(), "/_agent-native/agent-chat", {
      message: "x",
      internalContinuation: true,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).reached).toBe("chat-handler");
  });

  it("is inert when no app-level provider key is configured", async () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    mockUsage.mockResolvedValue({ totalCents: 999_999 } as Awaited<
      ReturnType<typeof getUsageSummary>
    >);
    const res = await post(buildApp(), "/_agent-native/agent-chat", {
      message: "hi",
    });
    expect(res.status).toBe(200);
    expect(mockUsage).not.toHaveBeenCalled();
  });
});
