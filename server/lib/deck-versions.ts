import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb, schema } from "../db/index.js";

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

// Retention: each snapshot is a full copy of decks.data, so without pruning
// the table grows linearly with agent/editor activity forever. Keep a bounded
// per-deck history window instead.
const MAX_VERSIONS_PER_DECK = 30;
const MAX_VERSION_AGE_MS = 90 * 24 * 60 * 60 * 1000;
// Bound the ids fetched per prune pass; the prune runs on every snapshot so a
// backlog drains across writes without one huge delete.
const PRUNE_BATCH = 200;

export interface DeckSnapshotSource {
  id: string;
  title: string;
  data: string;
  ownerEmail: string;
}

/**
 * Delete versions beyond the per-deck cap and older than the age window.
 * Best-effort: a prune failure must never fail the write that triggered it,
 * so callers get a logged warning instead of a thrown error.
 */
export async function pruneDeckVersions(
  deckId: string,
  ownerEmail: string,
): Promise<{ deleted: number }> {
  const db = getDb();
  const scope = and(
    eq(schema.deckVersions.deckId, deckId),
    eq(schema.deckVersions.ownerEmail, ownerEmail),
  );

  // Rows past the newest-N cap.
  const overCap = await db
    .select({ id: schema.deckVersions.id })
    .from(schema.deckVersions)
    .where(scope)
    .orderBy(desc(schema.deckVersions.createdAt))
    .offset(MAX_VERSIONS_PER_DECK)
    .limit(PRUNE_BATCH);

  // Rows older than the age window (ISO-8601 strings compare lexicographically).
  const cutoffIso = new Date(Date.now() - MAX_VERSION_AGE_MS).toISOString();
  const overAge = await db
    .select({ id: schema.deckVersions.id })
    .from(schema.deckVersions)
    .where(and(scope, lt(schema.deckVersions.createdAt, cutoffIso)))
    .orderBy(asc(schema.deckVersions.createdAt))
    .limit(PRUNE_BATCH);

  const ids = [...new Set([...overCap, ...overAge].map((row) => row.id))];
  if (!ids.length) return { deleted: 0 };

  await db
    .delete(schema.deckVersions)
    .where(inArray(schema.deckVersions.id, ids));
  return { deleted: ids.length };
}

export async function createDeckVersionSnapshot(
  source: DeckSnapshotSource,
  options: { force?: boolean; label?: string } = {},
): Promise<{ created: boolean; id?: string; reason?: string }> {
  if (!source.ownerEmail) {
    throw new Error("Cannot snapshot deck version without an owner email");
  }

  const db = getDb();
  const [latestVersion] = await db
    .select({
      title: schema.deckVersions.title,
      data: schema.deckVersions.data,
      createdAt: schema.deckVersions.createdAt,
    })
    .from(schema.deckVersions)
    .where(
      and(
        eq(schema.deckVersions.deckId, source.id),
        eq(schema.deckVersions.ownerEmail, source.ownerEmail),
      ),
    )
    .orderBy(desc(schema.deckVersions.createdAt))
    .limit(1);

  if (
    latestVersion &&
    latestVersion.title === source.title &&
    latestVersion.data === source.data
  ) {
    return { created: false, reason: "duplicate" };
  }

  if (!options.force && latestVersion?.createdAt) {
    const latestAt = new Date(latestVersion.createdAt).getTime();
    if (
      Number.isFinite(latestAt) &&
      Date.now() - latestAt < SNAPSHOT_INTERVAL_MS
    ) {
      return { created: false, reason: "interval" };
    }
  }

  const id = nanoid();
  await db.insert(schema.deckVersions).values({
    id,
    ownerEmail: source.ownerEmail,
    deckId: source.id,
    title: source.title,
    data: source.data,
    changeLabel: options.label,
    createdAt: new Date().toISOString(),
  });

  try {
    await pruneDeckVersions(source.id, source.ownerEmail);
  } catch (err) {
    // Retention is housekeeping — never fail the snapshot (and with it the
    // triggering write) over it, but keep the failure visible.
    console.warn(
      `[deck-versions] prune failed for deck ${source.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return { created: true, id };
}
