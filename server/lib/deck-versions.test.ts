import { beforeEach, describe, expect, it, vi } from "vitest";

// Queue of results for successive db.select() chains; each select consumes one.
let selectResults: unknown[][] = [];
let insertedRows: Record<string, unknown>[] = [];
let deletedWhere: unknown[] = [];
let deleteShouldFail = false;

function selectChain(): Record<string, unknown> {
  const result = selectResults.shift() ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const method of ["from", "where", "orderBy", "offset", "limit"]) {
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
  delete: () => ({
    where: async (condition: unknown) => {
      if (deleteShouldFail) throw new Error("delete failed");
      deletedWhere.push(condition);
    },
  }),
};

vi.mock("../db/index.js", () => ({
  getDb: () => mockDb,
  schema: {
    deckVersions: {
      id: "id",
      ownerEmail: "owner_email",
      deckId: "deck_id",
      title: "title",
      data: "data",
      changeLabel: "change_label",
      createdAt: "created_at",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ col, val }),
  lt: (col: unknown, val: unknown) => ({ lt: [col, val] }),
  desc: (col: unknown) => ({ desc: col }),
  asc: (col: unknown) => ({ asc: col }),
  inArray: (col: unknown, values: unknown[]) => ({ inArray: [col, values] }),
}));

vi.mock("nanoid", () => ({ nanoid: () => "version-id" }));

import {
  createDeckVersionSnapshot,
  pruneDeckVersions,
} from "./deck-versions.js";

const source = {
  id: "deck-1",
  title: "Deck",
  data: '{"slides":[]}',
  ownerEmail: "owner@example.test",
};

beforeEach(() => {
  selectResults = [];
  insertedRows = [];
  deletedWhere = [];
  deleteShouldFail = false;
});

describe("pruneDeckVersions", () => {
  it("deletes versions past the cap and past the age window, deduplicated", async () => {
    selectResults = [
      [{ id: "v-31" }, { id: "v-32" }], // past newest-30 cap
      [{ id: "v-32" }, { id: "v-old" }], // older than age cutoff (v-32 in both)
    ];
    const result = await pruneDeckVersions("deck-1", source.ownerEmail);
    expect(result.deleted).toBe(3);
    expect(deletedWhere).toHaveLength(1);
    expect(deletedWhere[0]).toEqual({
      inArray: ["id", ["v-31", "v-32", "v-old"]],
    });
  });

  it("is a no-op when nothing is past the cap or the age window", async () => {
    selectResults = [[], []];
    const result = await pruneDeckVersions("deck-1", source.ownerEmail);
    expect(result.deleted).toBe(0);
    expect(deletedWhere).toHaveLength(0);
  });
});

describe("createDeckVersionSnapshot", () => {
  it("skips exact duplicates without inserting", async () => {
    selectResults = [
      [
        {
          title: source.title,
          data: source.data,
          createdAt: new Date().toISOString(),
        },
      ],
    ];
    const result = await createDeckVersionSnapshot(source);
    expect(result).toEqual({ created: false, reason: "duplicate" });
    expect(insertedRows).toHaveLength(0);
  });

  it("inserts a snapshot and prunes retention afterwards", async () => {
    selectResults = [
      [], // no latest version
      [{ id: "v-31" }], // prune: past cap
      [], // prune: past age
    ];
    const result = await createDeckVersionSnapshot(source, {
      label: "Before editor edit",
    });
    expect(result).toEqual({ created: true, id: "version-id" });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      deckId: "deck-1",
      changeLabel: "Before editor edit",
    });
    expect(deletedWhere).toEqual([{ inArray: ["id", ["v-31"]] }]);
  });

  it("still reports created when the retention prune fails", async () => {
    deleteShouldFail = true;
    selectResults = [[], [{ id: "v-31" }], []];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await createDeckVersionSnapshot(source);
    expect(result).toEqual({ created: true, id: "version-id" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
