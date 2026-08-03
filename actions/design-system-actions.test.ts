/**
 * Lifecycle coverage for the design-system CRUD actions: create, update,
 * set-default, apply-to-deck, and delete. Grouped in one file because they
 * share a schema and the invariants worth pinning down are cross-action ones
 * (exactly one default per owner, no isDefault bleed across owners, no
 * unlinking of decks the caller cannot edit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertAccess = vi.fn();
const mockResolveAccess = vi.fn();
const mockNotifyClients = vi.fn();
let mockUserEmail: string | null = "alice@example.com";

/** Rows the ownership-probe SELECT resolves to (create-design-system). */
let ownedSystems: Array<{ id: string }> = [];
/** Design systems visible to the promote-a-new-default query in delete. */
let promotionCandidates: Array<{ id: string }> = [];
/** Deck rows linked to the design system being deleted. */
let linkedDecks: Array<{ id: string }> = [];
/** The single deck row the unlink read-modify-write re-reads. */
let deckRow: Record<string, unknown> | undefined;

let insertedValues: Record<string, unknown> | undefined;
const updateCalls: Array<{ set: Record<string, unknown>; where: unknown }> = [];
const deleteCalls: unknown[] = [];
let deckUpdateReturningRows: Array<{ id: string }> = [{ id: "deck-1" }];

const insertValuesFn = vi.fn(async (values: Record<string, unknown>) => {
  insertedValues = values;
});
const insertFn = vi.fn(() => ({ values: insertValuesFn }));

/**
 * One chainable builder standing in for drizzle. `select().from().where()` is
 * awaited directly in some call sites and chained with `.limit()`/`.orderBy()`
 * in others, so every link is both a thenable and a builder.
 */
function selectBuilder(rows: () => Promise<unknown[]>) {
  const node: Record<string, unknown> = {};
  const chain = () => Object.assign(Promise.resolve().then(rows), node);
  node.where = chain;
  node.limit = chain;
  node.orderBy = chain;
  node.from = chain;
  return chain();
}

/** Routes each SELECT to its fixture by target table and projected columns. */
const selectFn = vi.fn((projection?: Record<string, unknown>) => {
  const keys = projection ? Object.keys(projection) : [];
  return {
    from: (table: unknown) =>
      selectBuilder(async () => {
        if ((table as { id?: string })?.id === "ds.id") {
          // create-design-system probes for existing owned systems; delete
          // looks inside its transaction for a system to promote to default.
          return insideTransaction ? promotionCandidates : ownedSystems;
        }
        // The unlink read-modify-write projects `data`; the linked-deck scan
        // projects only `id`.
        if (keys.includes("data")) return deckRow ? [deckRow] : [];
        return linkedDecks;
      }),
  };
});

let insideTransaction = false;

const deckReturningFn = vi.fn(async () => deckUpdateReturningRows);
// Plain updates are awaited directly; the CAS unlink chains .returning(), so
// the where() result is both a promise and a builder.
const updateFn = vi.fn(() => ({
  set: (set: Record<string, unknown>) => ({
    where: (where: unknown) => {
      updateCalls.push({ set, where });
      return Object.assign(Promise.resolve(undefined), {
        returning: deckReturningFn,
      });
    },
  }),
}));

const deleteFn = vi.fn(() => ({
  where: (where: unknown) => {
    deleteCalls.push(where);
    return Promise.resolve(undefined);
  },
}));

const transactionFn = vi.fn(
  async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
    insideTransaction = true;
    try {
      return await cb({
        update: updateFn,
        delete: deleteFn,
        select: selectFn,
      });
    } finally {
      insideTransaction = false;
    }
  },
);

const mockDb = {
  select: selectFn,
  insert: insertFn,
  update: updateFn,
  delete: deleteFn,
  transaction: transactionFn,
};

vi.mock("../server/db/index.js", () => ({
  getDb: () => mockDb,
  schema: {
    decks: {
      id: "decks.id",
      rev: "decks.rev",
      data: "decks.data",
      designSystemId: "decks.designSystemId",
    },
    designSystems: {
      id: "ds.id",
      ownerEmail: "ds.ownerEmail",
      updatedAt: "ds.updatedAt",
      isDefault: "ds.isDefault",
    },
    designSystemShares: { resourceId: "dss.resourceId" },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
  desc: (column: unknown) => ({ desc: column }),
}));

vi.mock("@agent-native/core/sharing", () => ({
  assertAccess: (...args: unknown[]) => mockAssertAccess(...args),
  resolveAccess: (...args: unknown[]) => mockResolveAccess(...args),
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock("@agent-native/core/server/request-context", () => ({
  getRequestUserEmail: () => mockUserEmail,
  getRequestOrgId: () => "org-1",
}));

vi.mock("../server/handlers/decks.js", () => ({
  notifyClients: (...args: unknown[]) => mockNotifyClients(...args),
}));

vi.mock("nanoid", () => ({ nanoid: () => "generated-id" }));

import applyDesignSystem from "./apply-design-system";
import createDesignSystem from "./create-design-system";
import deleteDesignSystem from "./delete-design-system";
import setDefaultDesignSystem from "./set-default-design-system";
import updateDesignSystem from "./update-design-system";

/** Minimal payload satisfying missingDesignSystemDataFields. */
const validData = JSON.stringify({
  colors: {
    primary: "#111111",
    secondary: "#222222",
    accent: "#333333",
    background: "#ffffff",
    surface: "#f5f5f5",
    text: "#000000",
    textMuted: "#666666",
  },
  typography: {
    headingFont: "Inter",
    bodyFont: "Inter",
    headingWeight: "700",
    bodyWeight: "400",
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUserEmail = "alice@example.com";
  ownedSystems = [];
  promotionCandidates = [];
  linkedDecks = [];
  insideTransaction = false;
  deckRow = {
    designSystemId: "ds-1",
    data: JSON.stringify({ id: "deck-1", designSystemId: "ds-1", slides: [] }),
    rev: 2,
  };
  insertedValues = undefined;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  deckUpdateReturningRows = [{ id: "deck-1" }];
  deckReturningFn.mockImplementation(async () => deckUpdateReturningRows);
  mockAssertAccess.mockResolvedValue({
    resource: {
      id: "ds-1",
      ownerEmail: "alice@example.com",
      isDefault: false,
    },
  });
  mockResolveAccess.mockResolvedValue({ role: "owner", resource: {} });
});

describe("create-design-system", () => {
  it("makes the caller's first design system their default", async () => {
    ownedSystems = [];

    const result = await createDesignSystem.run({
      title: "Acme",
      data: validData,
    });

    expect(result.isDefault).toBe(true);
    expect(insertedValues?.isDefault).toBe(true);
  });

  it("does not make a later design system the default", async () => {
    ownedSystems = [{ id: "ds-existing" }];

    const result = await createDesignSystem.run({
      title: "Second",
      data: validData,
    });

    expect(result.isDefault).toBe(false);
  });

  it("rejects data that is not valid JSON", async () => {
    await expect(
      createDesignSystem.run({ title: "Acme", data: "{not json" }),
    ).rejects.toThrow("data must be a valid JSON string");
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejects data missing the fields the renderers read unconditionally", async () => {
    // The Design Systems page reads data.colors.* / data.typography.* without
    // guards, so a partial payload would surface as a render crash later.
    await expect(
      createDesignSystem.run({
        title: "Acme",
        data: JSON.stringify({ colors: { primary: "#fff" } }),
      }),
    ).rejects.toThrow(/missing required design system field/);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejects assets that are not valid JSON", async () => {
    await expect(
      createDesignSystem.run({
        title: "Acme",
        data: validData,
        assets: "[oops",
      }),
    ).rejects.toThrow("assets must be a valid JSON string");
  });

  it("refuses to create an ownerless design system", async () => {
    mockUserEmail = null;

    await expect(
      createDesignSystem.run({ title: "Acme", data: validData }),
    ).rejects.toThrow("no authenticated user");
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("defaults customInstructions to empty rather than null", async () => {
    await createDesignSystem.run({ title: "Acme", data: validData });

    expect(insertedValues?.customInstructions).toBe("");
    expect(insertedValues?.description).toBeNull();
  });
});

describe("update-design-system", () => {
  it("only writes the fields that were supplied", async () => {
    await updateDesignSystem.run({ id: "ds-1", title: "Renamed" });

    expect(updateCalls).toHaveLength(1);
    expect(Object.keys(updateCalls[0].set).sort()).toEqual([
      "title",
      "updatedAt",
    ]);
  });

  it("lets an empty string clear customInstructions", async () => {
    await updateDesignSystem.run({ id: "ds-1", customInstructions: "" });

    expect(updateCalls[0].set.customInstructions).toBe("");
  });

  it("validates data before checking access, and never writes bad JSON", async () => {
    await expect(
      updateDesignSystem.run({ id: "ds-1", data: "{nope" }),
    ).rejects.toThrow("data must be a valid JSON string");
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects a data payload missing required fields", async () => {
    await expect(
      updateDesignSystem.run({ id: "ds-1", data: JSON.stringify({}) }),
    ).rejects.toThrow(/missing required design system field/);
  });

  it("requires editor access", async () => {
    await updateDesignSystem.run({ id: "ds-1", title: "X" });

    expect(mockAssertAccess).toHaveBeenCalledWith(
      "design-system",
      "ds-1",
      "editor",
    );
  });
});

describe("set-default-design-system", () => {
  it("clears the caller's other defaults and sets the new one atomically", async () => {
    await setDefaultDesignSystem.run({ id: "ds-2" });

    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].set.isDefault).toBe(false);
    expect(updateCalls[1].set.isDefault).toBe(true);
  });

  it("scopes both writes to the caller so defaults never bleed across owners", async () => {
    // isDefault is a per-owner flag; editor access on a shared system must not
    // flip another owner's default.
    await setDefaultDesignSystem.run({ id: "ds-2" });

    expect(updateCalls[0].where).toEqual({
      column: "ds.ownerEmail",
      value: "alice@example.com",
    });
    expect(updateCalls[1].where).toEqual({
      and: [
        { column: "ds.id", value: "ds-2" },
        { column: "ds.ownerEmail", value: "alice@example.com" },
      ],
    });
  });
});

describe("apply-design-system", () => {
  it("requires editor on the deck and viewer on the design system", async () => {
    await applyDesignSystem.run({ deckId: "deck-1", designSystemId: "ds-1" });

    expect(mockAssertAccess).toHaveBeenCalledWith("deck", "deck-1", "editor");
    expect(mockAssertAccess).toHaveBeenCalledWith(
      "design-system",
      "ds-1",
      "viewer",
    );
  });

  it("does not write when the design system is not readable", async () => {
    mockAssertAccess.mockImplementation(async (kind: string) => {
      if (kind === "design-system") throw new Error("forbidden");
      return { resource: {} };
    });

    await expect(
      applyDesignSystem.run({ deckId: "deck-1", designSystemId: "ds-other" }),
    ).rejects.toThrow("forbidden");
    expect(updateCalls).toHaveLength(0);
  });

  it("links the design system and notifies clients", async () => {
    await applyDesignSystem.run({ deckId: "deck-1", designSystemId: "ds-1" });

    expect(updateCalls[0].set.designSystemId).toBe("ds-1");
    expect(mockNotifyClients).toHaveBeenCalledWith("deck-1");
  });
});

describe("delete-design-system", () => {
  it("requires admin access", async () => {
    await deleteDesignSystem.run({ id: "ds-1" });

    expect(mockAssertAccess).toHaveBeenCalledWith(
      "design-system",
      "ds-1",
      "admin",
    );
  });

  it("deletes the shares alongside the system", async () => {
    await deleteDesignSystem.run({ id: "ds-1" });

    expect(deleteCalls).toHaveLength(2);
  });

  it("promotes another of the owner's systems when the default is deleted", async () => {
    mockAssertAccess.mockResolvedValue({
      resource: { id: "ds-1", ownerEmail: "alice@example.com", isDefault: true },
    });
    promotionCandidates = [{ id: "ds-next" }];

    await deleteDesignSystem.run({ id: "ds-1" });

    const promotion = updateCalls.find((c) => c.set.isDefault === true);
    expect(promotion?.where).toEqual({ column: "ds.id", value: "ds-next" });
  });

  it("does not promote anything when the deleted system was not the default", async () => {
    promotionCandidates = [{ id: "ds-next" }];

    await deleteDesignSystem.run({ id: "ds-1" });

    expect(updateCalls.some((c) => c.set.isDefault === true)).toBe(false);
  });

  it("unlinks a linked deck through a rev-guarded write", async () => {
    linkedDecks = [{ id: "deck-1" }];

    const result = await deleteDesignSystem.run({ id: "ds-1" });

    const unlink = updateCalls.find((c) => c.set.designSystemId === null);
    expect(unlink).toBeDefined();
    expect(unlink?.set.rev).toBe(3);
    // The stale id must also be stripped from the JSON blob, not just the column.
    expect(JSON.parse(unlink?.set.data as string)).not.toHaveProperty(
      "designSystemId",
    );
    expect(result).not.toHaveProperty("decksSkippedForAccess");
  });

  it("leaves decks the caller cannot edit dangling and reports them", async () => {
    // Admin on a shared design system does not imply edit rights on every deck
    // that references it — silently mutating those would be worse than a
    // dangling reference.
    linkedDecks = [{ id: "deck-1" }];
    mockResolveAccess.mockResolvedValue({ role: "viewer", resource: {} });

    const result = await deleteDesignSystem.run({ id: "ds-1" });

    expect(result.decksSkippedForAccess).toEqual(["deck-1"]);
    expect(updateCalls.some((c) => c.set.designSystemId === null)).toBe(false);
  });

  it("reports decks it failed to unlink instead of swallowing the error", async () => {
    linkedDecks = [{ id: "deck-1" }];
    deckUpdateReturningRows = [];

    const result = await deleteDesignSystem.run({ id: "ds-1" });

    expect(result.decksFailedToUnlink).toEqual(["deck-1"]);
    expect(result.deleted).toBe(true);
  });

  it("skips the blob rewrite when the deck already points elsewhere", async () => {
    linkedDecks = [{ id: "deck-1" }];
    deckRow = {
      designSystemId: "ds-other",
      data: JSON.stringify({ id: "deck-1" }),
      rev: 2,
    };

    const result = await deleteDesignSystem.run({ id: "ds-1" });

    expect(updateCalls.some((c) => c.set.designSystemId === null)).toBe(false);
    expect(result).not.toHaveProperty("decksFailedToUnlink");
  });
});
