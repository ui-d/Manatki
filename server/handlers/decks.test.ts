import { beforeEach, describe, expect, it, vi } from "vitest";

const deckRows = vi.hoisted(() => ({ current: [] as unknown[] }));
const shareRows = vi.hoisted(() => ({ current: [] as unknown[] }));
const mockDecksTable = vi.hoisted(() => ({
  id: "decks.id",
  ownerEmail: "decks.owner_email",
  orgId: "decks.org_id",
  visibility: "decks.visibility",
}));
const mockSharesTable = vi.hoisted(() => ({
  resourceId: "deck_shares.resource_id",
  principalType: "deck_shares.principal_type",
  principalId: "deck_shares.principal_id",
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: unknown) => handler,
  setResponseStatus: vi.fn(),
  createEventStream: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => {
          const rows =
            table === mockDecksTable ? deckRows.current : shareRows.current;
          const thenable = Promise.resolve(rows) as Promise<unknown[]> & {
            limit: (n: number) => Promise<unknown[]>;
          };
          thenable.limit = async () => rows;
          return thenable;
        }),
      })),
    })),
  }),
  schema: { decks: mockDecksTable, deckShares: mockSharesTable },
}));

vi.mock("./request-auth-context.js", () => ({
  resolveSlidesRequestAuthContext: vi.fn(),
}));

import { notifyClients } from "./decks";

interface FakeClient {
  push: (data: string) => void;
  email: string;
  orgId: string | null;
}

const registry = (
  globalThis as typeof globalThis & {
    __slidesSSEClientsV2?: Set<FakeClient>;
  }
).__slidesSSEClientsV2!;

function addClient(email: string, orgId: string | null): string[] {
  const received: string[] = [];
  registry.add({ push: (data) => received.push(data), email, orgId });
  return received;
}

async function flushDelivery(): Promise<void> {
  // Delivery is fire-and-forget with awaited DB reads inside; two macrotask
  // turns are enough for both the deck lookup and the shares lookup.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("notifyClients scoped fan-out", () => {
  beforeEach(() => {
    registry.clear();
    deckRows.current = [];
    shareRows.current = [];
  });

  it("delivers a private deck's events only to its owner", async () => {
    const owner = addClient("owner@example.com", "org-1");
    const orgMate = addClient("mate@example.com", "org-1");
    const stranger = addClient("stranger@example.com", "org-2");

    notifyClients("deck-1", {
      audience: {
        ownerEmail: "Owner@Example.com",
        orgId: "org-1",
        visibility: "private",
      },
    });
    await flushDelivery();

    expect(owner).toHaveLength(1);
    expect(orgMate).toHaveLength(0);
    expect(stranger).toHaveLength(0);
  });

  it("delivers org-visible decks to org members but not outsiders", async () => {
    const owner = addClient("owner@example.com", "org-1");
    const orgMate = addClient("mate@example.com", "org-1");
    const stranger = addClient("stranger@example.com", "org-2");

    notifyClients("deck-1", {
      audience: {
        ownerEmail: "owner@example.com",
        orgId: "org-1",
        visibility: "org",
      },
    });
    await flushDelivery();

    expect(owner).toHaveLength(1);
    expect(orgMate).toHaveLength(1);
    expect(stranger).toHaveLength(0);
  });

  it("delivers to per-user grant holders on private decks", async () => {
    const granted = addClient("granted@example.com", "org-2");
    const stranger = addClient("stranger@example.com", "org-2");
    shareRows.current = [
      { principalType: "user", principalId: "Granted@Example.com" },
    ];

    notifyClients("deck-1", {
      audience: {
        ownerEmail: "owner@example.com",
        orgId: "org-1",
        visibility: "private",
      },
    });
    await flushDelivery();

    expect(granted).toHaveLength(1);
    expect(stranger).toHaveLength(0);
  });

  it("loads the audience from the deck row when not supplied", async () => {
    const owner = addClient("owner@example.com", null);
    const stranger = addClient("stranger@example.com", null);
    deckRows.current = [
      { ownerEmail: "owner@example.com", orgId: null, visibility: "private" },
    ];

    notifyClients("deck-1");
    await flushDelivery();

    expect(owner).toHaveLength(1);
    expect(stranger).toHaveLength(0);
  });

  it("delivers to no one when the deck row is gone and no audience given", async () => {
    const anyone = addClient("owner@example.com", null);
    deckRows.current = [];

    notifyClients("deck-gone");
    await flushDelivery();

    expect(anyone).toHaveLength(0);
  });
});
