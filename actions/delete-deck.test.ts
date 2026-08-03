import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertAccess = vi.fn();
const mockNotifyClients = vi.fn();
const mockRevokeShareLinksForDeck = vi.fn(async () => undefined);
const mockDeletePreviewBlob = vi.fn(async () => undefined);

/** Rows returned by the deck DELETE; empty means the row was already gone. */
let deckDeleteRows: Array<{ id: string }> = [{ id: "deck-1" }];
const deletedWhereClauses: unknown[] = [];

const returningFn = vi.fn(async () => deckDeleteRows);
// `db.delete(...).where(...)` is awaited directly for deckVersions and chained
// with .returning() for decks, so the where() result must be both.
const deleteFn = vi.fn(() => ({
  where: (clause: unknown) => {
    deletedWhereClauses.push(clause);
    const result = { returning: returningFn } as Record<string, unknown>;
    return Object.assign(Promise.resolve(undefined), result);
  },
}));
const mockDb = { delete: deleteFn };

vi.mock("../server/db/index.js", () => ({
  getDb: () => mockDb,
  schema: {
    decks: { id: "decks.id" },
    deckVersions: { deckId: "dv.deckId", ownerEmail: "dv.ownerEmail" },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock("@agent-native/core/sharing", () => ({
  assertAccess: (...args: unknown[]) => mockAssertAccess(...args),
  // Declared in the factory because vi.mock hoists above top-level consts.
  ForbiddenError: class ForbiddenError extends Error {},
}));

// Deliberately different from the deck's ownerEmail so assertions on the
// (owner, caller) pair can actually detect a swapped or duplicated argument.
vi.mock("@agent-native/core/server/request-context", () => ({
  getRequestUserEmail: () => "carol@example.com",
}));

vi.mock("../server/handlers/decks.js", () => ({
  notifyClients: (...args: unknown[]) => mockNotifyClients(...args),
}));

vi.mock("../server/handlers/share.js", () => ({
  revokeShareLinksForDeck: (...args: unknown[]) =>
    mockRevokeShareLinksForDeck(...args),
}));

vi.mock("../server/lib/preview-blob-gc.js", () => ({
  deletePreviewBlob: (...args: unknown[]) => mockDeletePreviewBlob(...args),
}));

import { ForbiddenError } from "@agent-native/core/sharing";

import action from "./delete-deck";

function access(overrides: Record<string, unknown> = {}) {
  return {
    resource: {
      id: "deck-1",
      ownerEmail: "alice@example.com",
      orgId: "org-1",
      visibility: "private",
      previewUrl: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deckDeleteRows = [{ id: "deck-1" }];
  deletedWhereClauses.length = 0;
  returningFn.mockImplementation(async () => deckDeleteRows);
  mockRevokeShareLinksForDeck.mockResolvedValue(undefined);
  mockAssertAccess.mockResolvedValue(access());
});

describe("delete-deck", () => {
  it("requires admin access before touching any row", async () => {
    await action.run({ id: "deck-1" });

    expect(mockAssertAccess).toHaveBeenCalledWith("deck", "deck-1", "admin");
    expect(mockAssertAccess.mock.invocationCallOrder[0]).toBeLessThan(
      deleteFn.mock.invocationCallOrder[0],
    );
  });

  it("returns 404 rather than 403 so callers cannot probe for hidden decks", async () => {
    mockAssertAccess.mockRejectedValue(new ForbiddenError("no"));

    const err = await action.run({ id: "deck-1" }).catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(404);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("deletes version history scoped to the owner, then the deck", async () => {
    await action.run({ id: "deck-1" });

    expect(deleteFn).toHaveBeenCalledTimes(2);
    // Version history must be scoped by ownerEmail as well as deckId.
    expect(deletedWhereClauses[0]).toEqual({
      and: [
        { column: "dv.deckId", value: "deck-1" },
        { column: "dv.ownerEmail", value: "alice@example.com" },
      ],
    });
  });

  it("reports 404 when the row vanished between the access check and the delete", async () => {
    deckDeleteRows = [];

    const err = await action.run({ id: "deck-1" }).catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(404);
    expect(mockNotifyClients).not.toHaveBeenCalled();
  });

  it("revokes public share links so they cannot outlive the deck", async () => {
    await action.run({ id: "deck-1" });

    expect(mockRevokeShareLinksForDeck).toHaveBeenCalledWith("deck-1");
  });

  it("still succeeds when share-link revocation fails", async () => {
    // Links expire via TTL anyway — a revoke failure must not strand the deck.
    mockRevokeShareLinksForDeck.mockRejectedValue(new Error("network"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(action.run({ id: "deck-1" })).resolves.toEqual({
      success: true,
    });

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("garbage-collects the preview blob when one exists", async () => {
    mockAssertAccess.mockResolvedValue(
      access({ previewUrl: "https://blob.test/p.png" }),
    );

    await action.run({ id: "deck-1" });

    // Owner first, then the caller performing the delete — the blob may be
    // stored under either tenant prefix.
    expect(mockDeletePreviewBlob).toHaveBeenCalledWith(
      "https://blob.test/p.png",
      ["alice@example.com", "carol@example.com"],
    );
  });

  it("skips blob GC when the deck had no preview", async () => {
    await action.run({ id: "deck-1" });

    expect(mockDeletePreviewBlob).not.toHaveBeenCalled();
  });

  it("passes the pre-delete audience to notifyClients", async () => {
    // The row is gone by now, so scoped delivery cannot look the audience up.
    await action.run({ id: "deck-1" });

    expect(mockNotifyClients).toHaveBeenCalledWith("deck-1", {
      type: "deck-deleted",
      audience: {
        ownerEmail: "alice@example.com",
        orgId: "org-1",
        visibility: "private",
      },
    });
  });
});
