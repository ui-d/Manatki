import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_DECK_PAYLOAD_BYTES } from "../shared/slide-content-limits.js";

// ---------------------------------------------------------------------------
// Mocks. The CAS helpers in _deck-write.js stay real — the concurrency
// guarantee is exactly what these tests exist to pin down.
// ---------------------------------------------------------------------------

const mockResolveAccess = vi.fn();
const mockAssertAccess = vi.fn();
const mockNotifyClients = vi.fn();
const mockCreateDeckVersionSnapshot = vi.fn(async () => undefined);
let mockUserEmail: string | null = "alice@example.com";

/** Rows returned by the guarded UPDATE; empty means another writer won. */
let updateReturningRows: Array<{ id: string }> = [{ id: "deck-1" }];
let updatedFields: Record<string, unknown> | undefined;
let insertedValues: Record<string, unknown> | undefined;
let insertShouldThrow = false;

const returningUpdateFn = vi.fn(async () => updateReturningRows);
const whereUpdateFn = vi.fn(() => ({ returning: returningUpdateFn }));
const setFn = vi.fn((fields: Record<string, unknown>) => {
  updatedFields = fields;
  return { where: whereUpdateFn };
});
const updateFn = vi.fn(() => ({ set: setFn }));
const valuesFn = vi.fn(async (values: Record<string, unknown>) => {
  if (insertShouldThrow) throw new Error("UNIQUE constraint failed: decks.id");
  insertedValues = values;
});
const insertFn = vi.fn(() => ({ values: valuesFn }));
const mockDb = { update: updateFn, insert: insertFn };

vi.mock("../server/db/index.js", () => ({
  getDb: () => mockDb,
  schema: { decks: { id: "decks.id", rev: "decks.rev" } },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock("@agent-native/core/sharing", () => ({
  resolveAccess: (...args: unknown[]) => mockResolveAccess(...args),
  assertAccess: (...args: unknown[]) => mockAssertAccess(...args),
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock("@agent-native/core/server/request-context", () => ({
  getRequestUserEmail: () => mockUserEmail,
  getRequestOrgId: () => "org-1",
}));

vi.mock("../server/handlers/decks.js", () => ({
  notifyClients: (...args: unknown[]) => mockNotifyClients(...args),
}));

vi.mock("../server/lib/deck-versions.js", () => ({
  createDeckVersionSnapshot: (...args: unknown[]) =>
    mockCreateDeckVersionSnapshot(...args),
}));

// Inline-image rewriting is covered by _slide-content.test.ts; here it only
// needs to be observably applied to every slide.
vi.mock("./_slide-content.js", () => ({
  prepareSlideContentForPersist: vi.fn(async (content: string) =>
    content.replace("data:image/png;base64,AAAA", "https://blob.test/img.png"),
  ),
}));

import action from "./save-deck";

/** An existing deck row as resolveAccess returns it. */
function deckRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "deck-1",
    title: "Roadmap",
    data: JSON.stringify({ id: "deck-1", title: "Roadmap", slides: [] }),
    designSystemId: null,
    ownerEmail: "alice@example.com",
    rev: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserEmail = "alice@example.com";
  updateReturningRows = [{ id: "deck-1" }];
  updatedFields = undefined;
  insertedValues = undefined;
  insertShouldThrow = false;
  // clearAllMocks wipes calls but not implementations, so a per-test
  // mockImplementationOnce would otherwise leak into the next test.
  returningUpdateFn.mockImplementation(async () => updateReturningRows);
  mockAssertAccess.mockResolvedValue(undefined);
});

describe("save-deck — concurrency", () => {
  it("guards the write on the rev read with the row and bumps it", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });

    await action.run({
      deckId: "deck-1",
      deck: { title: "Roadmap v2", slides: [] },
    });

    // rev 3 was read, so the write must land as rev 4 and only match rev 3.
    expect(updatedFields?.rev).toBe(4);
    expect(whereUpdateFn).toHaveBeenCalledWith({
      and: [
        { column: "decks.id", value: "deck-1" },
        { column: "decks.rev", value: 3 },
      ],
    });
  });

  it("retries the whole read-modify-write when another instance won the race", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });
    // First guarded UPDATE matches nothing (someone else bumped rev), second wins.
    updateReturningRows = [];
    returningUpdateFn.mockImplementationOnce(async () => []);
    returningUpdateFn.mockImplementation(async () => [{ id: "deck-1" }]);

    await action.run({ deckId: "deck-1", deck: { title: "T", slides: [] } });

    // Re-resolved the row rather than blind-writing the stale payload.
    expect(mockResolveAccess).toHaveBeenCalledTimes(2);
    expect(mockNotifyClients).toHaveBeenCalledTimes(1);
  });

  it("surfaces a 409 rather than clobbering when conflicts never clear", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });
    updateReturningRows = [];

    const err = await action
      .run({ deckId: "deck-1", deck: { title: "T", slides: [] } })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(409);
    expect(mockNotifyClients).not.toHaveBeenCalled();
  });
});

describe("save-deck — access control", () => {
  it("creates the deck for the caller when no row is visible", async () => {
    mockResolveAccess.mockResolvedValue(null);

    await action.run({ deckId: "deck-new", deck: { title: "Fresh", slides: [] } });

    expect(insertedValues?.id).toBe("deck-new");
    expect(insertedValues?.ownerEmail).toBe("alice@example.com");
    expect(insertedValues?.orgId).toBe("org-1");
  });

  it("maps a taken id to 404 so callers cannot probe for other owners' decks", async () => {
    mockResolveAccess.mockResolvedValue(null);
    insertShouldThrow = true;

    const err = await action
      .run({ deckId: "deck-taken", deck: { title: "X", slides: [] } })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(404);
    // The raw driver error can echo bound params — it must not leak out.
    expect((err as Error).message).toBe("Deck not found");
  });

  it("rejects anonymous creates", async () => {
    mockResolveAccess.mockResolvedValue(null);
    mockUserEmail = null;

    const err = await action
      .run({ deckId: "deck-new", deck: { title: "X", slides: [] } })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(403);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("gives viewers the same 404 as no access, not a 403", async () => {
    mockResolveAccess.mockResolvedValue({
      role: "viewer",
      resource: deckRow(),
    });

    const err = await action
      .run({ deckId: "deck-1", deck: { title: "X", slides: [] } })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(404);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "editor"])("allows %s to write", async (role) => {
    mockResolveAccess.mockResolvedValue({ role, resource: deckRow() });

    await action.run({ deckId: "deck-1", deck: { title: "X", slides: [] } });

    expect(updateFn).toHaveBeenCalled();
  });
});

describe("save-deck — payload hygiene", () => {
  it("rewrites inline images in every slide before persisting", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });

    await action.run({
      deckId: "deck-1",
      deck: {
        title: "X",
        slides: [
          { id: "s1", content: '<img src="data:image/png;base64,AAAA">' },
          { id: "s2", content: '<img src="data:image/png;base64,AAAA">' },
        ],
      },
    });

    const persisted = updatedFields?.data as string;
    expect(persisted).not.toContain("base64");
    expect(persisted).toContain("https://blob.test/img.png");
  });

  it("rejects an over-limit payload with 413 before taking the deck lock", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });
    const huge = "x".repeat(MAX_DECK_PAYLOAD_BYTES + 1);

    const err = await action
      .run({ deckId: "deck-1", deck: { title: "X", notes: huge, slides: [] } })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(413);
    expect(mockResolveAccess).not.toHaveBeenCalled();
  });

  it("rejects an invalid aspect ratio", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });

    const err = await action
      .run({
        deckId: "deck-1",
        deck: { title: "X", aspectRatio: "3:1", slides: [] },
      })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(400);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("rejects an invalid project kind", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });

    const err = await action
      .run({
        deckId: "deck-1",
        deck: { title: "X", kind: "newsletter", slides: [] },
      })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(400);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("stamps the deck id and updatedAt onto the persisted payload", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });

    await action.run({
      deckId: "deck-1",
      deck: { id: "wrong-id", title: "X", slides: [] },
    });

    const persisted = JSON.parse(updatedFields?.data as string);
    expect(persisted.id).toBe("deck-1");
    expect(persisted.updatedAt).toBe(updatedFields?.updatedAt);
  });
});

describe("save-deck — version snapshots", () => {
  it("snapshots the previous state before overwriting changed content", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });

    await action.run({
      deckId: "deck-1",
      deck: { title: "Roadmap", slides: [{ id: "s1", content: "<p>New</p>" }] },
    });

    expect(mockCreateDeckVersionSnapshot).toHaveBeenCalledTimes(1);
  });

  it("skips the snapshot when only updatedAt differs", async () => {
    // A save that changes nothing but the timestamp must not spend a history slot.
    const stored = { id: "deck-1", title: "Roadmap", slides: [] };
    mockResolveAccess.mockResolvedValue({
      role: "owner",
      resource: deckRow({
        data: JSON.stringify({ ...stored, updatedAt: "2020-01-01T00:00:00Z" }),
      }),
    });

    await action.run({ deckId: "deck-1", deck: { ...stored } });

    expect(mockCreateDeckVersionSnapshot).not.toHaveBeenCalled();
    expect(updateFn).toHaveBeenCalled();
  });

  it("snapshots when only the title changed", async () => {
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });

    await action.run({
      deckId: "deck-1",
      deck: { id: "deck-1", title: "Renamed", slides: [] },
    });

    expect(mockCreateDeckVersionSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("save-deck — design system", () => {
  it("keeps the stored design system when the payload omits one", async () => {
    mockResolveAccess.mockResolvedValue({
      role: "owner",
      resource: deckRow({ designSystemId: "ds-existing" }),
    });

    await action.run({ deckId: "deck-1", deck: { title: "X", slides: [] } });

    expect(updatedFields?.designSystemId).toBe("ds-existing");
  });

  it("rejects a design system the caller cannot read", async () => {
    class ForbiddenError extends Error {}
    mockResolveAccess.mockResolvedValue({ role: "owner", resource: deckRow() });
    const sharing = await import("@agent-native/core/sharing");
    mockAssertAccess.mockRejectedValue(
      new (sharing.ForbiddenError as typeof ForbiddenError)("nope"),
    );

    const err = await action
      .run({
        deckId: "deck-1",
        deck: { title: "X", designSystemId: "ds-other", slides: [] },
      })
      .catch((e: unknown) => e);

    expect((err as { statusCode?: number }).statusCode).toBe(400);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
