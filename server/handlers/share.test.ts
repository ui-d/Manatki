import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadBody = vi.hoisted(() => vi.fn());
const mockAssertAccess = vi.hoisted(() => vi.fn());
const mockResolveSlidesRequestAuthContext = vi.hoisted(() => vi.fn());
const mockWithSlidesRequestContext = vi.hoisted(() => vi.fn());
const mockSetResponseStatus = vi.hoisted(() => vi.fn());
const insertedRows = vi.hoisted(() => ({ current: [] as unknown[] }));

const mockInsertValues = vi.hoisted(() =>
  vi.fn(async (row: unknown) => {
    insertedRows.current.push(row);
  }),
);
const mockDeleteWhere = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockGetRouterParam = vi.hoisted(() => vi.fn());
const mockGetQuery = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => ({}) as Record<string, unknown>),
);
const selectRows = vi.hoisted(() => ({ current: [] as unknown[] }));
const updatedSets = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("h3", () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: (...args: unknown[]) => mockGetRouterParam(...args),
  getQuery: (...args: unknown[]) => mockGetQuery(...args),
  setResponseStatus: (...args: unknown[]) => mockSetResponseStatus(...args),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
}));

vi.mock("@agent-native/core/server", () => ({
  readBody: (...args: unknown[]) => mockReadBody(...args),
}));

vi.mock("@agent-native/core/sharing", () => ({
  assertAccess: (...args: unknown[]) => mockAssertAccess(...args),
  ForbiddenError: class ForbiddenError extends Error {
    statusCode = 403;
  },
}));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: vi.fn(() => ({ values: mockInsertValues })),
    delete: vi.fn(() => ({ where: mockDeleteWhere })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectRows.current),
          orderBy: vi.fn(async () => selectRows.current),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async () => {
          updatedSets.current.push(values);
        }),
      })),
    })),
  }),
  schema: {
    deckShareLinks: {
      token: "token_col",
      title: "title_col",
      slides: "slides_col",
      aspectRatio: "aspect_ratio_col",
      createdAt: "created_at_col",
      ownerEmail: "owner_email_col",
      deckId: "deck_id_col",
      revokedAt: "revoked_at_col",
    },
  },
}));

vi.mock("./request-auth-context.js", () => ({
  resolveSlidesRequestAuthContext: (...args: unknown[]) =>
    mockResolveSlidesRequestAuthContext(...args),
  withSlidesRequestContext: (...args: unknown[]) =>
    mockWithSlidesRequestContext(...args),
}));

import {
  getSharedDeck,
  listShareLinks,
  revokeShareLink,
  shareDeck,
} from "./share";

describe("shareDeck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedRows.current = [];
    mockReadBody.mockResolvedValue({ deck: { id: "deck-1" } });
    mockResolveSlidesRequestAuthContext.mockResolvedValue({
      email: "owner@example.com",
    });
    mockWithSlidesRequestContext.mockImplementation(async (_event, callback) =>
      callback(),
    );
    mockAssertAccess.mockResolvedValue({
      resource: {
        title: "Launch review",
        data: JSON.stringify({
          aspectRatio: "16:9",
          slides: [
            {
              id: "slide-1",
              content: "<h1>Launch</h1>",
              notes: "internal talking points",
              layout: "title",
              background: "#111",
              transition: "fade",
              splitByParagraph: true,
              animations: [
                {
                  id: "anim-1",
                  elementIndex: 0,
                  elementPath: [1, 0],
                  type: "slide-up",
                },
              ],
            },
          ],
        }),
      },
    });
  });

  it("keeps presentation animation metadata in share snapshots without speaker notes", async () => {
    const result = await shareDeck({} as any);

    expect(result).toEqual({ shareToken: expect.any(String) });
    expect(insertedRows.current).toHaveLength(1);

    const row = insertedRows.current[0] as Record<string, unknown>;
    const envelope = JSON.parse(row.slides as string);

    expect(envelope.kind).toBe("deck");
    expect(envelope.slides).toEqual([
      {
        id: "slide-1",
        content: "<h1>Launch</h1>",
        notes: "",
        layout: "title",
        background: "#111",
        transition: "fade",
        splitByParagraph: true,
        animations: [
          {
            id: "anim-1",
            elementIndex: 0,
            elementPath: [1, 0],
            type: "slide-up",
          },
        ],
      },
    ]);
  });

  it("stores the social kind and per-asset sizes in the snapshot envelope", async () => {
    mockAssertAccess.mockResolvedValue({
      resource: {
        title: "Campaign assets",
        data: JSON.stringify({
          kind: "social",
          slides: [
            {
              id: "asset-1",
              content: "<div>Post</div>",
              layout: "blank",
              size: { width: 1080, height: 1350, preset: "ig-portrait" },
            },
            {
              id: "asset-2",
              content: "<div>Bad size dropped</div>",
              layout: "blank",
              size: { width: 10, height: 10 },
            },
          ],
        }),
      },
    });

    await shareDeck({} as any);

    const row = insertedRows.current[0] as Record<string, unknown>;
    const envelope = JSON.parse(row.slides as string);

    expect(envelope.kind).toBe("social");
    expect(envelope.slides[0].size).toEqual({
      width: 1080,
      height: 1350,
      preset: "ig-portrait",
    });
    // Out-of-bounds dims are dropped so the share page falls back to the
    // deck aspect ratio instead of rendering a broken canvas.
    expect(envelope.slides[1].size).toBeUndefined();
  });
});

describe("getSharedDeck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.current = [];
    mockGetRouterParam.mockReturnValue("token-1");
  });

  it("reads legacy bare-array rows as deck snapshots", async () => {
    selectRows.current = [
      {
        token: "token-1",
        title: "Old deck",
        slides: JSON.stringify([
          { id: "slide-1", content: "hi", notes: "", layout: "content" },
        ]),
        aspectRatio: "16:9",
        createdAt: new Date().toISOString(),
      },
    ];

    const result = (await getSharedDeck({} as any)) as Record<string, unknown>;

    expect(result.kind).toBe("deck");
    expect(result.slides).toEqual([
      { id: "slide-1", content: "hi", notes: "", layout: "content" },
    ]);
  });

  it("reads envelope rows and surfaces the social kind", async () => {
    selectRows.current = [
      {
        token: "token-1",
        title: "Campaign",
        slides: JSON.stringify({
          kind: "social",
          slides: [
            {
              id: "asset-1",
              content: "post",
              notes: "",
              layout: "blank",
              size: { width: 1080, height: 1920, preset: "ig-story" },
            },
          ],
        }),
        aspectRatio: null,
        createdAt: new Date().toISOString(),
      },
    ];

    const result = (await getSharedDeck({} as any)) as Record<string, unknown>;

    expect(result.kind).toBe("social");
    expect((result.slides as Array<{ size?: unknown }>)[0].size).toEqual({
      width: 1080,
      height: 1920,
      preset: "ig-story",
    });
  });

  it("returns 404 for revoked links, identical to missing ones", async () => {
    selectRows.current = [
      {
        token: "token-1",
        title: "Revoked deck",
        slides: JSON.stringify([]),
        aspectRatio: null,
        createdAt: new Date().toISOString(),
        revokedAt: new Date().toISOString(),
      },
    ];

    const result = (await getSharedDeck({} as any)) as Record<string, unknown>;

    expect(mockSetResponseStatus).toHaveBeenCalledWith({}, 404);
    expect(result.error).toBe("Shared presentation not found or has expired");
  });
});

describe("revokeShareLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.current = [];
    updatedSets.current = [];
    mockGetRouterParam.mockReturnValue("token-1");
    mockResolveSlidesRequestAuthContext.mockResolvedValue({
      email: "owner@example.com",
    });
    mockWithSlidesRequestContext.mockImplementation(async (_event, callback) =>
      callback(),
    );
  });

  it("lets the minting owner revoke their link", async () => {
    selectRows.current = [
      {
        token: "token-1",
        ownerEmail: "owner@example.com",
        deckId: "deck-1",
        revokedAt: null,
      },
    ];

    const result = (await revokeShareLink({} as any)) as Record<
      string,
      unknown
    >;

    expect(result.success).toBe(true);
    expect(updatedSets.current).toHaveLength(1);
    expect(
      (updatedSets.current[0] as { revokedAt: string }).revokedAt,
    ).toBeTruthy();
  });

  it("404s for a non-owner without deck access, and writes nothing", async () => {
    selectRows.current = [
      {
        token: "token-1",
        ownerEmail: "someone-else@example.com",
        deckId: "deck-1",
        revokedAt: null,
      },
    ];
    const { ForbiddenError } = await import("@agent-native/core/sharing");
    mockAssertAccess.mockRejectedValue(new (ForbiddenError as any)("no"));

    const result = (await revokeShareLink({} as any)) as Record<
      string,
      unknown
    >;

    expect(mockSetResponseStatus).toHaveBeenCalledWith({}, 404);
    expect(result.error).toBe("Share link not found");
    expect(updatedSets.current).toHaveLength(0);
  });

  it("lets a deck admin revoke a link minted by someone else", async () => {
    selectRows.current = [
      {
        token: "token-1",
        ownerEmail: "someone-else@example.com",
        deckId: "deck-1",
        revokedAt: null,
      },
    ];
    mockAssertAccess.mockResolvedValue({ resource: {} });

    const result = (await revokeShareLink({} as any)) as Record<
      string,
      unknown
    >;

    expect(result.success).toBe(true);
    expect(mockAssertAccess).toHaveBeenCalledWith("deck", "deck-1", "admin");
    expect(updatedSets.current).toHaveLength(1);
  });
});

describe("listShareLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.current = [];
    mockGetQuery.mockReturnValue({ deckId: "deck-1" });
    mockResolveSlidesRequestAuthContext.mockResolvedValue({
      email: "owner@example.com",
    });
    mockWithSlidesRequestContext.mockImplementation(async (_event, callback) =>
      callback(),
    );
  });

  it("returns active links for a deck the caller administers", async () => {
    mockAssertAccess.mockResolvedValue({ resource: {} });
    selectRows.current = [
      { token: "token-1", createdAt: "2026-07-31T00:00:00.000Z" },
    ];

    const result = (await listShareLinks({} as any)) as Record<string, unknown>;

    expect(mockAssertAccess).toHaveBeenCalledWith("deck", "deck-1", "admin");
    expect(result.links).toEqual([
      { token: "token-1", createdAt: "2026-07-31T00:00:00.000Z" },
    ]);
  });

  it("propagates access failures without listing", async () => {
    const { ForbiddenError } = await import("@agent-native/core/sharing");
    mockAssertAccess.mockRejectedValue(new (ForbiddenError as any)("no"));

    const result = (await listShareLinks({} as any)) as Record<string, unknown>;

    expect(mockSetResponseStatus).toHaveBeenCalledWith({}, 403);
    expect(result.links).toBeUndefined();
  });
});
