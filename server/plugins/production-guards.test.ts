import { afterEach, describe, expect, it } from "vitest";

import productionGuards from "./production-guards";

const ENV_KEYS = ["AUTH_DISABLED", "VERCEL_ENV", "VERCEL", "NODE_ENV"] as const;
const saved = new Map<string, string | undefined>();

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe("production-guards plugin", () => {
  it("throws when AUTH_DISABLED=true in Vercel production", () => {
    setEnv({ AUTH_DISABLED: "true", VERCEL_ENV: "production" });
    expect(() => productionGuards()).toThrow(/AUTH_DISABLED/);
  });

  it("throws for the '1' spelling and mixed case", () => {
    setEnv({ AUTH_DISABLED: " TRUE ", VERCEL_ENV: "production" });
    expect(() => productionGuards()).toThrow(/AUTH_DISABLED/);
    setEnv({ AUTH_DISABLED: "1", VERCEL_ENV: "production" });
    expect(() => productionGuards()).toThrow(/AUTH_DISABLED/);
  });

  it("allows AUTH_DISABLED in local dev (no VERCEL_ENV)", () => {
    setEnv({
      AUTH_DISABLED: "true",
      VERCEL_ENV: undefined,
      VERCEL: undefined,
      NODE_ENV: "development",
    });
    expect(() => productionGuards()).not.toThrow();
  });

  it("allows AUTH_DISABLED on Vercel preview deployments", () => {
    setEnv({
      AUTH_DISABLED: "true",
      VERCEL_ENV: "preview",
      VERCEL: "1",
      NODE_ENV: "production",
    });
    expect(() => productionGuards()).not.toThrow();
  });

  it("ignores values core also ignores (e.g. 'yes', empty)", () => {
    setEnv({ AUTH_DISABLED: "yes", VERCEL_ENV: "production" });
    expect(() => productionGuards()).not.toThrow();
    setEnv({ AUTH_DISABLED: "", VERCEL_ENV: "production" });
    expect(() => productionGuards()).not.toThrow();
  });

  it("boots cleanly in production when AUTH_DISABLED is unset", () => {
    setEnv({ AUTH_DISABLED: undefined, VERCEL_ENV: "production" });
    expect(() => productionGuards()).not.toThrow();
  });
});
