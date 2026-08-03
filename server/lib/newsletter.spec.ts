import { beforeEach, describe, expect, it, vi } from "vitest";

// Queue of results for successive db.select() chains; each select consumes one.
let selectResults: unknown[][] = [];
let insertedRows: Record<string, unknown>[] = [];
let updateSets: Record<string, unknown>[] = [];

function selectChain(): Record<string, unknown> {
  const result = selectResults.shift() ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const method of ["from", "where", "limit"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

const mockDb = {
  select: () => selectChain(),
  insert: () => ({
    values: async (row: Record<string, unknown>) => {
      insertedRows.push(row);
    },
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        updateSets.push(values);
      },
    }),
  }),
};

vi.mock("../db/index.js", () => ({
  getDb: () => mockDb,
  schema: {
    newsletterSubscribers: {
      email: "email",
      status: "status",
      confirmToken: "confirm_token",
      unsubscribeToken: "unsubscribe_token",
      $inferSelect: {},
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

const sendEmailMock = vi.fn();
vi.mock("@agent-native/core/server", () => ({
  renderEmail: (args: { heading: string }) => ({
    html: `<h1>${args.heading}</h1>`,
    text: args.heading,
  }),
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

vi.mock("../../actions/_app-url.js", () => ({
  getSlidesAppUrl: () => "https://app.test",
}));

import {
  confirmExpiry,
  confirmUrl,
  isExpired,
  markConfirmed,
  markUnsubscribed,
  newToken,
  normalizeEmail,
  sendConfirmationEmail,
  unsubscribeUrl,
  upsertPending,
  type SubscriberRow,
} from "./newsletter.js";

function subscriberRow(overrides: Partial<SubscriberRow> = {}): SubscriberRow {
  return {
    email: "user@example.test",
    status: "pending",
    consentSource: "settings",
    consentedAt: new Date().toISOString(),
    confirmedAt: null,
    unsubscribedAt: null,
    confirmToken: "a".repeat(64),
    confirmTokenExpiresAt: confirmExpiry(),
    unsubscribeToken: "b".repeat(64),
    resendContactId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as SubscriberRow;
}

beforeEach(() => {
  selectResults = [];
  insertedRows = [];
  updateSets = [];
  sendEmailMock.mockReset();
});

describe("pure helpers", () => {
  it("normalizes email case and whitespace", () => {
    expect(normalizeEmail("  User@Example.TEST ")).toBe("user@example.test");
  });

  it("mints 64-char lowercase hex tokens, unique per call", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("treats missing, malformed, and past timestamps as expired", () => {
    expect(isExpired(null)).toBe(true);
    expect(isExpired("not-a-date")).toBe(true);
    expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isExpired(confirmExpiry())).toBe(false);
  });

  it("builds confirm and unsubscribe URLs on the app origin", () => {
    expect(confirmUrl("tok")).toBe(
      "https://app.test/newsletter/confirm?token=tok",
    );
    expect(unsubscribeUrl("tok")).toBe(
      "https://app.test/newsletter/unsubscribe?token=tok",
    );
  });
});

describe("upsertPending", () => {
  it("creates a pending row with both tokens for a new email", async () => {
    const inserted = subscriberRow();
    selectResults = [[], [inserted]]; // no existing row, then re-read
    const result = await upsertPending(" User@Example.TEST ", "decks-prompt");
    expect(result.shouldSendEmail).toBe(true);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      email: "user@example.test",
      status: "pending",
      consentSource: "decks-prompt",
    });
    expect(insertedRows[0].confirmToken).toMatch(/^[0-9a-f]{64}$/);
    expect(insertedRows[0].unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is a no-op for an already-subscribed address", async () => {
    const existing = subscriberRow({
      status: "subscribed",
      confirmToken: null,
    });
    selectResults = [[existing]];
    const result = await upsertPending("user@example.test", "settings");
    expect(result.shouldSendEmail).toBe(false);
    expect(insertedRows).toHaveLength(0);
    expect(updateSets).toHaveLength(0);
  });

  it("throttles re-sends for a fresh pending row", async () => {
    const existing = subscriberRow({ updatedAt: new Date().toISOString() });
    selectResults = [[existing]];
    const result = await upsertPending("user@example.test", "settings");
    expect(result.shouldSendEmail).toBe(false);
    expect(updateSets).toHaveLength(0);
  });

  it("re-consents an unsubscribed row with a fresh confirm token, keeping the unsubscribe token", async () => {
    const existing = subscriberRow({
      status: "unsubscribed",
      confirmToken: null,
      unsubscribedAt: new Date().toISOString(),
    });
    selectResults = [[existing], [subscriberRow()]];
    const result = await upsertPending("user@example.test", "settings");
    expect(result.shouldSendEmail).toBe(true);
    expect(updateSets).toHaveLength(1);
    expect(updateSets[0]).toMatchObject({
      status: "pending",
      consentSource: "settings",
      confirmedAt: null,
      unsubscribedAt: null,
    });
    expect(updateSets[0].confirmToken).toMatch(/^[0-9a-f]{64}$/);
    expect(updateSets[0]).not.toHaveProperty("unsubscribeToken");
  });
});

describe("status transitions", () => {
  it("markConfirmed subscribes and clears the confirm token", async () => {
    await markConfirmed(subscriberRow());
    expect(updateSets).toEqual([
      expect.objectContaining({
        status: "subscribed",
        confirmToken: null,
        confirmTokenExpiresAt: null,
      }),
    ]);
    expect(updateSets[0].confirmedAt).toBeTruthy();
  });

  it("markUnsubscribed records withdrawal and clears the confirm token", async () => {
    await markUnsubscribed(subscriberRow({ status: "subscribed" }));
    expect(updateSets).toEqual([
      expect.objectContaining({ status: "unsubscribed", confirmToken: null }),
    ]);
    expect(updateSets[0].unsubscribedAt).toBeTruthy();
  });
});

describe("sendConfirmationEmail", () => {
  it("sends to the subscriber with the confirm link", async () => {
    const row = subscriberRow();
    await sendConfirmationEmail(row);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe(row.email);
    expect(args.subject).toContain("Confirm");
  });

  it("refuses to send without a confirm token", async () => {
    await expect(
      sendConfirmationEmail(subscriberRow({ confirmToken: null })),
    ).rejects.toThrow(/confirm token/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
