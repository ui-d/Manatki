import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db/index.js", () => ({
  schema: {
    decks: { id: "decks.id", rev: "decks.rev" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
}));

vi.mock("@agent-native/core/sharing", () => ({
  assertAccess: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {},
}));

import {
  casUpdateDeck,
  deckRevOf,
  DeckWriteConflictError,
  retryDeckWrite,
} from "./_deck-write.js";

function mockExecutor(returningRows: unknown[]) {
  const returning = vi.fn(async () => returningRows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { executor: { update }, update, set, where, returning };
}

describe("deckRevOf", () => {
  it("returns the numeric rev from a row", () => {
    expect(deckRevOf({ rev: 7 })).toBe(7);
  });

  it("defaults to 0 for rows from before the column existed", () => {
    expect(deckRevOf({})).toBe(0);
    expect(deckRevOf(undefined)).toBe(0);
    expect(deckRevOf({ rev: null } as never)).toBe(0);
    expect(deckRevOf({ rev: "3" } as never)).toBe(0);
  });
});

describe("casUpdateDeck", () => {
  it("bumps rev and guards the update on the rev read at the start", async () => {
    const { executor, set } = mockExecutor([{ id: "deck-1" }]);
    await casUpdateDeck(executor, "deck-1", 3, { data: "{}", updatedAt: "t" });
    expect(set).toHaveBeenCalledWith({ data: "{}", updatedAt: "t", rev: 4 });
  });

  it("throws DeckWriteConflictError when no row matched the expected rev", async () => {
    const { executor } = mockExecutor([]);
    await expect(
      casUpdateDeck(executor, "deck-1", 3, { data: "{}" }),
    ).rejects.toBeInstanceOf(DeckWriteConflictError);
  });
});

describe("retryDeckWrite", () => {
  it("returns the attempt's value on success", async () => {
    await expect(retryDeckWrite("deck-1", async () => "ok")).resolves.toBe(
      "ok",
    );
  });

  it("re-runs the whole read-modify-write after a conflict", async () => {
    let calls = 0;
    const result = await retryDeckWrite("deck-1", async () => {
      calls += 1;
      if (calls === 1) throw new DeckWriteConflictError("deck-1");
      return "second-attempt";
    });
    expect(result).toBe("second-attempt");
    expect(calls).toBe(2);
  });

  it("propagates non-conflict errors without retrying", async () => {
    let calls = 0;
    await expect(
      retryDeckWrite("deck-1", async () => {
        calls += 1;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  it("surfaces a 409 once attempts are exhausted", async () => {
    let calls = 0;
    const err = await retryDeckWrite("deck-1", async () => {
      calls += 1;
      throw new DeckWriteConflictError("deck-1");
    }).catch((e: unknown) => e);
    expect(calls).toBe(4);
    expect((err as { statusCode?: number }).statusCode).toBe(409);
    expect((err as Error).message).toContain("deck-1");
  });
});
