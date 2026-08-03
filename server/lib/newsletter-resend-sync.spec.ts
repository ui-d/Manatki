import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let secretValue: string | null = null;
vi.mock("@agent-native/core/server", () => ({
  resolveSecret: async () => secretValue,
}));

import {
  isAudienceSyncEnabled,
  syncContactSubscribed,
  syncContactUnsubscribed,
} from "./newsletter-resend-sync.js";

const fetchMock = vi.fn();

beforeEach(() => {
  secretValue = null;
  delete process.env.RESEND_AUDIENCE_ID;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_AUDIENCE_ID;
});

describe("isAudienceSyncEnabled", () => {
  it("is disabled without an audience id", async () => {
    secretValue = "re_key";
    expect(await isAudienceSyncEnabled()).toBe(false);
  });

  it("is disabled without an API key", async () => {
    process.env.RESEND_AUDIENCE_ID = "aud_1";
    expect(await isAudienceSyncEnabled()).toBe(false);
  });

  it("is enabled with both", async () => {
    process.env.RESEND_AUDIENCE_ID = "aud_1";
    secretValue = "re_key";
    expect(await isAudienceSyncEnabled()).toBe(true);
  });
});

describe("syncContactSubscribed", () => {
  it("skips silently when sync is not configured", async () => {
    expect(await syncContactSubscribed("user@example.test")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the contact and returns its id", async () => {
    process.env.RESEND_AUDIENCE_ID = "aud_1";
    secretValue = "re_key";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "contact_1" }),
    });
    const id = await syncContactSubscribed("user@example.test");
    expect(id).toBe("contact_1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/audiences/aud_1/contacts");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body)).toEqual({
      email: "user@example.test",
      unsubscribed: false,
    });
  });

  it("swallows API failures and returns null", async () => {
    process.env.RESEND_AUDIENCE_ID = "aud_1";
    secretValue = "re_key";
    fetchMock.mockRejectedValue(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await syncContactSubscribed("user@example.test")).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("syncContactUnsubscribed", () => {
  it("patches by contact id when known and never throws on failure", async () => {
    process.env.RESEND_AUDIENCE_ID = "aud_1";
    secretValue = "re_key";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await syncContactUnsubscribed("user@example.test", "contact_1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.resend.com/audiences/aud_1/contacts/contact_1",
    );
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ unsubscribed: true });

    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      syncContactUnsubscribed("user@example.test"),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
