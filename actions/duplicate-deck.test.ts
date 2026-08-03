import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveAccess = vi.fn();
let mockUserEmail: string | null = "alice@example.com";
let mockOrgId: string | null = "org-1";

let insertedValues: Record<string, unknown> | undefined;
const valuesFn = vi.fn(async (values: Record<string, unknown>) => {
  insertedValues = values;
});
const insertFn = vi.fn(() => ({ values: valuesFn }));
const mockDb = { insert: insertFn };

vi.mock("../server/db/index.js", () => ({
  getDb: () => mockDb,
  schema: { decks: { id: "decks.id" } },
}));

vi.mock("@agent-native/core/sharing", () => ({
  resolveAccess: (...args: unknown[]) => mockResolveAccess(...args),
}));

vi.mock("@agent-native/core/server/request-context", () => ({
  getRequestUserEmail: () => mockUserEmail,
  getRequestOrgId: () => mockOrgId,
}));

// Must return a distinct value per call — a constant would make the
// per-slide-id uniqueness assertion below vacuous.
let nanoidCalls = 0;
vi.mock("nanoid", () => ({ nanoid: () => `uid${nanoidCalls++}` }));

import action from "./duplicate-deck";

const sourceDeck = {
  id: "deck-src",
  title: "Roadmap",
  slides: [
    { id: "slide-a", content: "<p>One</p>" },
    { id: "slide-b", content: "<p>Two</p>" },
  ],
};

function access(overrides: Record<string, unknown> = {}) {
  return {
    role: "owner",
    resource: {
      id: "deck-src",
      title: "Roadmap",
      data: JSON.stringify(sourceDeck),
      designSystemId: null,
      ownerEmail: "alice@example.com",
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://slides.agent.test");
  mockUserEmail = "alice@example.com";
  mockOrgId = "org-1";
  insertedValues = undefined;
  mockResolveAccess.mockResolvedValue(access());
});

describe("duplicate-deck", () => {
  it("refuses to duplicate a deck the caller cannot see", async () => {
    mockResolveAccess.mockResolvedValue(null);

    await expect(action.run({ deckId: "deck-src" })).rejects.toThrow(
      "Deck not found: deck-src",
    );
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("gives every slide in the copy a fresh id", async () => {
    // Shared slide ids across decks would make later per-slide edits ambiguous.
    await action.run({ deckId: "deck-src" });

    const copied = JSON.parse(insertedValues?.data as string);
    const ids = copied.slides.map((s: { id: string }) => s.id);
    expect(ids).not.toContain("slide-a");
    expect(ids).not.toContain("slide-b");
    expect(copied.slides).toHaveLength(2);
    // Distinct from each other too, not just from the source.
    expect(new Set(ids).size).toBe(2);
  });

  it("leaves the source deck payload untouched", async () => {
    await action.run({ deckId: "deck-src" });

    expect(sourceDeck.slides[0].id).toBe("slide-a");
  });

  it("defaults the title to 'Copy of ...' and honours an explicit one", async () => {
    const auto = await action.run({ deckId: "deck-src" });
    expect(auto.title).toBe("Copy of Roadmap");

    const named = await action.run({ deckId: "deck-src", title: "Q3 plan" });
    expect(named.title).toBe("Q3 plan");
    expect(JSON.parse(insertedValues?.data as string).title).toBe("Q3 plan");
  });

  it("uses a client-supplied id so the UI can navigate optimistically", async () => {
    const result = await action.run({
      deckId: "deck-src",
      newId: "deck-preallocated",
    });

    expect(result.id).toBe("deck-preallocated");
    expect(insertedValues?.id).toBe("deck-preallocated");
  });

  it("mints its own id when the client supplies none", async () => {
    const result = await action.run({ deckId: "deck-src" });

    expect(result.id).toMatch(/^deck-/);
    expect(result.id).not.toBe("deck-src");
  });

  it("carries the source design system onto the copy", async () => {
    mockResolveAccess.mockResolvedValue(access({ designSystemId: "ds-1" }));

    await action.run({ deckId: "deck-src" });

    expect(insertedValues?.designSystemId).toBe("ds-1");
    expect(JSON.parse(insertedValues?.data as string).designSystemId).toBe(
      "ds-1",
    );
  });

  it("assigns the copy to the caller, not the source owner", async () => {
    // A duplicate made by a collaborator belongs to that collaborator.
    mockUserEmail = "bob@example.com";

    await action.run({ deckId: "deck-src" });

    expect(insertedValues?.ownerEmail).toBe("bob@example.com");
  });

  it("refuses to create an ownerless deck", async () => {
    mockUserEmail = null;

    await expect(action.run({ deckId: "deck-src" })).rejects.toThrow(
      "no authenticated user",
    );
  });

  it("stores a null org rather than an empty string when there is no org", async () => {
    mockOrgId = null;

    await action.run({ deckId: "deck-src" });

    expect(insertedValues?.orgId).toBeNull();
  });

  it("reports the slide count and a deep link to the copy", async () => {
    const result = await action.run({
      deckId: "deck-src",
      newId: "deck-copy",
    });

    expect(result.slideCount).toBe(2);
    expect(result.url).toContain("deck-copy");
  });
});
