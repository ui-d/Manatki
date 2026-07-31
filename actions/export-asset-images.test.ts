import { beforeEach, describe, expect, it, vi } from "vitest";

let deckData: Record<string, unknown>;

const mockAssertAccess = vi.fn();
const mockWriteAppState = vi.fn(async () => undefined);
const mockWriteAppStateForCurrentTab = vi.fn(async () => undefined);
const mockReadAppStateForCurrentTab = vi.fn<
  (key: string) => Promise<unknown>
>(async () => null);

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () =>
          deckData ? [{ data: JSON.stringify(deckData) }] : [],
      }),
    }),
  }),
};

vi.mock("../server/db/index.js", () => ({
  getDb: () => mockDb,
  schema: { decks: { id: "id", data: "data" } },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock("@agent-native/core/sharing", () => ({
  assertAccess: (...args: unknown[]) => mockAssertAccess(...args),
}));

vi.mock("@agent-native/core/application-state", () => ({
  writeAppState: (...args: unknown[]) => mockWriteAppState(...args),
  readAppState: vi.fn(async () => null),
}));

vi.mock("./_tab-state.js", () => ({
  readAppStateForCurrentTab: (key: string) =>
    mockReadAppStateForCurrentTab(key),
  writeAppStateForCurrentTab: (...args: unknown[]) =>
    mockWriteAppStateForCurrentTab(...args),
}));

vi.mock("./_app-url.js", () => ({
  getDeckUrl: (id: string) => `https://app.test/deck/${id}`,
}));

import action from "./export-asset-images";

const run = (args: Record<string, unknown>) =>
  (action as unknown as { run: (a: Record<string, unknown>) => Promise<any> }).run(
    args,
  );

beforeEach(() => {
  vi.clearAllMocks();
  deckData = {
    slides: [{ id: "slide-1" }, { id: "slide-2" }],
  };
});

describe("export-asset-images", () => {
  it("rejects unknown slide ids with a helpful message", async () => {
    await expect(
      run({ deckId: "deck-1", slideIds: ["nope"] }),
    ).rejects.toThrow(/Slide id\(s\) not found.*nope/);
  });

  it("writes the request and returns hosted URLs when the editor answers", async () => {
    let requestId: string | undefined;
    mockWriteAppStateForCurrentTab.mockImplementation(
      async (_key: unknown, value: unknown) => {
        requestId = (value as { requestId: string }).requestId;
      },
    );
    mockReadAppStateForCurrentTab.mockImplementation(async () => ({
      requestId,
      deckId: "deck-1",
      status: "done",
      images: [
        {
          slideId: "slide-1",
          slideNumber: 1,
          url: "https://blob.test/a.png",
          width: 1080,
          height: 1080,
        },
      ],
      completedAt: 1,
    }));

    const result = await run({ deckId: "deck-1", slideIds: ["slide-1"] });
    expect(result.count).toBe(1);
    expect(result.images[0].url).toBe("https://blob.test/a.png");
    // Request must be mirrored to the global key for cross-tab pickup.
    expect(mockWriteAppState).toHaveBeenCalledWith(
      "png-export-request",
      expect.objectContaining({ deckId: "deck-1", slideIds: ["slide-1"] }),
    );
  });

  it("surfaces an editor-side failure as an error", async () => {
    let requestId: string | undefined;
    mockWriteAppStateForCurrentTab.mockImplementation(
      async (_key: unknown, value: unknown) => {
        requestId = (value as { requestId: string }).requestId;
      },
    );
    mockReadAppStateForCurrentTab.mockImplementation(async () => ({
      requestId,
      deckId: "deck-1",
      status: "error",
      images: [],
      error: "upload blew up",
      completedAt: 1,
    }));

    await expect(run({ deckId: "deck-1" })).rejects.toThrow(
      /upload blew up/,
    );
  });

  it("tells the caller to open the deck when no editor can answer", async () => {
    // A read failure means no request context (headless) — nothing will
    // ever answer, so the action must exit with the open-the-deck message
    // instead of polling for the full window.
    mockReadAppStateForCurrentTab.mockImplementation(async () => {
      throw new Error("no request context");
    });
    await expect(run({ deckId: "deck-1" })).rejects.toThrow(
      /open .*deck\/deck-1/i,
    );
  });

  it("fails clearly for an empty deck", async () => {
    deckData = { slides: [] };
    await expect(run({ deckId: "deck-1" })).rejects.toThrow(
      /no slides to export/,
    );
  });
});
