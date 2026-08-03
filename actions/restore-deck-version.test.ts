import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertAccess = vi.fn();
const mockNotifyClients = vi.fn();
const mockCreateDeckVersionSnapshot = vi.fn(async () => undefined);
const mockWriteAppState = vi.fn(async () => undefined);

/** The snapshot row the SELECT resolves to; undefined means "not found". */
let versionRow: Record<string, unknown> | undefined;
/** Rows returned by the guarded UPDATE; empty means another writer won. */
let updateReturningRows: Array<{ id: string }> = [{ id: "deck-1" }];
let updatedFields: Record<string, unknown> | undefined;
let selectWhereClause: unknown;

const limitFn = vi.fn(async () => (versionRow ? [versionRow] : []));
const whereSelectFn = vi.fn((clause: unknown) => {
  selectWhereClause = clause;
  return { limit: limitFn };
});
const fromFn = vi.fn(() => ({ where: whereSelectFn }));
const selectFn = vi.fn(() => ({ from: fromFn }));

const returningUpdateFn = vi.fn(async () => updateReturningRows);
const whereUpdateFn = vi.fn(() => ({ returning: returningUpdateFn }));
const setFn = vi.fn((fields: Record<string, unknown>) => {
  updatedFields = fields;
  return { where: whereUpdateFn };
});
const updateFn = vi.fn(() => ({ set: setFn }));
const mockDb = { select: selectFn, update: updateFn };

vi.mock("../server/db/index.js", () => ({
  getDb: () => mockDb,
  schema: {
    decks: { id: "decks.id", rev: "decks.rev" },
    deckVersions: {
      id: "dv.id",
      deckId: "dv.deckId",
      ownerEmail: "dv.ownerEmail",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock("@agent-native/core/sharing", () => ({
  assertAccess: (...args: unknown[]) => mockAssertAccess(...args),
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock("@agent-native/core/application-state", () => ({
  writeAppState: (...args: unknown[]) => mockWriteAppState(...args),
}));

vi.mock("../server/handlers/decks.js", () => ({
  notifyClients: (...args: unknown[]) => mockNotifyClients(...args),
}));

vi.mock("../server/lib/deck-versions.js", () => ({
  createDeckVersionSnapshot: (...args: unknown[]) =>
    mockCreateDeckVersionSnapshot(...args),
}));

import action from "./restore-deck-version";

/** The timestamp stored inside the snapshot payload; must not be revived. */
const STALE_UPDATED_AT = "2019-01-01T00:00:00.000Z";

function access(overrides: Record<string, unknown> = {}) {
  return {
    resource: {
      id: "deck-1",
      title: "Current title",
      data: JSON.stringify({ id: "deck-1", title: "Current title", slides: [] }),
      ownerEmail: "alice@example.com",
      rev: 5,
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://slides.agent.test");
  updateReturningRows = [{ id: "deck-1" }];
  updatedFields = undefined;
  selectWhereClause = undefined;
  versionRow = {
    id: "ver-1",
    title: "Old title",
    // Carries a stale updatedAt so a restore that revived it instead of
    // stamping `now` would be detectable.
    data: JSON.stringify({
      title: "Old title",
      updatedAt: STALE_UPDATED_AT,
      slides: [{ id: "s1" }, { id: "s2" }],
    }),
  };
  returningUpdateFn.mockImplementation(async () => updateReturningRows);
  limitFn.mockImplementation(async () => (versionRow ? [versionRow] : []));
  mockAssertAccess.mockResolvedValue(access());
});

describe("restore-deck-version — concurrency", () => {
  it("guards the restore on the rev read with the deck row", async () => {
    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(updatedFields?.rev).toBe(6);
    expect(whereUpdateFn).toHaveBeenCalledWith({
      and: [
        { column: "decks.id", value: "deck-1" },
        { column: "decks.rev", value: 5 },
      ],
    });
  });

  it("re-reads and retries when another writer bumped the deck mid-restore", async () => {
    returningUpdateFn.mockImplementationOnce(async () => []);

    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(mockAssertAccess).toHaveBeenCalledTimes(2);
    expect(mockNotifyClients).toHaveBeenCalledTimes(1);
  });

  it("surfaces a 409 rather than clobbering when conflicts never clear", async () => {
    updateReturningRows = [];

    const err = await action
      .run({ deckId: "deck-1", versionId: "ver-1" })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(409);
  });
});

describe("restore-deck-version", () => {
  it("requires editor access", async () => {
    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(mockAssertAccess).toHaveBeenCalledWith("deck", "deck-1", "editor");
  });

  it("scopes the snapshot lookup to the deck and its owner", async () => {
    // Without the deckId/ownerEmail scope a caller could restore someone
    // else's snapshot into their own deck.
    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(selectWhereClause).toEqual({
      and: [
        { column: "dv.id", value: "ver-1" },
        { column: "dv.deckId", value: "deck-1" },
        { column: "dv.ownerEmail", value: "alice@example.com" },
      ],
    });
  });

  it("fails when the snapshot does not exist", async () => {
    versionRow = undefined;

    await expect(
      action.run({ deckId: "deck-1", versionId: "ver-missing" }),
    ).rejects.toThrow("Deck version not found: ver-missing");
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("snapshots the current deck first so restore is itself reversible", async () => {
    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(mockCreateDeckVersionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "deck-1", ownerEmail: "alice@example.com" }),
      { force: true, label: "Before restore" },
    );
    expect(
      mockCreateDeckVersionSnapshot.mock.invocationCallOrder[0],
    ).toBeLessThan(updateFn.mock.invocationCallOrder[0]);
  });

  it("writes the snapshot payload back over the deck", async () => {
    const result = await action.run({ deckId: "deck-1", versionId: "ver-1" });

    const restored = JSON.parse(updatedFields?.data as string);
    expect(restored.slides).toHaveLength(2);
    expect(restored.title).toBe("Old title");
    expect(result.restoredVersionId).toBe("ver-1");
    expect(result.slideCount).toBe(2);
  });

  it("stamps a fresh updatedAt rather than reviving the snapshot's", async () => {
    const result = await action.run({ deckId: "deck-1", versionId: "ver-1" });

    const persisted = JSON.parse(updatedFields?.data as string).updatedAt;
    expect(persisted).not.toBe(STALE_UPDATED_AT);
    expect(persisted).toBe(result.updatedAt);
    expect(updatedFields?.updatedAt).toBe(result.updatedAt);
  });

  it("falls back to the deck's current title when the snapshot has none", async () => {
    versionRow = {
      id: "ver-1",
      title: "",
      data: JSON.stringify({ slides: [] }),
    };

    const result = await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(result.title).toBe("Current title");
  });

  it("restores the snapshot's design system link", async () => {
    versionRow = {
      id: "ver-1",
      title: "Old title",
      data: JSON.stringify({ slides: [], designSystemId: "ds-old" }),
    };

    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(updatedFields?.designSystemId).toBe("ds-old");
  });

  it("clears the design system when the snapshot had none", async () => {
    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(updatedFields?.designSystemId).toBeNull();
  });

  it("signals connected clients to refresh", async () => {
    await action.run({ deckId: "deck-1", versionId: "ver-1" });

    expect(mockNotifyClients).toHaveBeenCalledWith("deck-1");
    expect(mockWriteAppState).toHaveBeenCalledWith(
      "refresh-signal",
      expect.objectContaining({ source: "restore-deck-version" }),
    );
  });
});
