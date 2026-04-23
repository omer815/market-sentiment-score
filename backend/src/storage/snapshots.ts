import { desc, eq, and, gte, lte } from 'drizzle-orm';
import { snapshots, sourceReadings } from './schema.js';
import type { DB } from './client.js';
import type { SourceId } from '../fetchers/types.js';
import type { FetchStatus } from '../lib/errors.js';

export interface ReadingRow {
  sourceId: SourceId;
  rawValue: number | null;
  flagTriggered: 0 | 1 | null;
  normalisedValue: 0 | 25 | null;
  fetchStatus: FetchStatus;
  fetchError: string | null;
  fetchedAt: string;
}

export interface SnapshotWrite {
  slotTs: string;
  fetchedAt: string;
  compositeScore: 0 | 25 | 50 | 75 | 100 | null;
  status: 'complete' | 'partial' | 'no-data';
  failedSources: SourceId[];
  readings: ReadingRow[];
}

/**
 * Insert a snapshot and its per-source readings.
 * Idempotent: ON CONFLICT DO NOTHING on `slot_ts` (snapshot) and (slot_ts, source_id) (readings).
 * Returns `true` if a new snapshot was inserted, `false` if one already existed for the slot.
 */
export async function insertSnapshot(db: DB, snap: SnapshotWrite): Promise<boolean> {
  const inserted = await db
    .insert(snapshots)
    .values({
      slotTs: snap.slotTs,
      fetchedAt: snap.fetchedAt,
      compositeScore: snap.compositeScore,
      status: snap.status,
      failedSources: snap.failedSources.join(','),
    })
    .onConflictDoNothing({ target: snapshots.slotTs })
    .returning({ slotTs: snapshots.slotTs });

  if (inserted.length === 0) {
    return false;
  }

  if (snap.readings.length > 0) {
    await db
      .insert(sourceReadings)
      .values(
        snap.readings.map((r) => ({
          slotTs: snap.slotTs,
          sourceId: r.sourceId,
          rawValue: r.rawValue,
          flagTriggered: r.flagTriggered,
          normalisedValue: r.normalisedValue,
          fetchStatus: r.fetchStatus,
          fetchError: r.fetchError,
          fetchedAt: r.fetchedAt,
        })),
      )
      .onConflictDoNothing();
  }

  return true;
}

export async function getLatestSnapshot(db: DB) {
  const rows = await db.select().from(snapshots).orderBy(desc(snapshots.slotTs)).limit(1);
  return rows[0] ?? null;
}

export async function getReadingsForSlot(db: DB, slotTs: string) {
  return db.select().from(sourceReadings).where(eq(sourceReadings.slotTs, slotTs));
}

export async function getSnapshotsBetween(db: DB, fromIso: string, toIso: string) {
  return db
    .select()
    .from(snapshots)
    .where(and(gte(snapshots.slotTs, fromIso), lte(snapshots.slotTs, toIso)))
    .orderBy(snapshots.slotTs);
}

export async function getSourceSeries(
  db: DB,
  sourceId: SourceId,
  fromIso: string,
  toIso: string,
) {
  return db
    .select()
    .from(sourceReadings)
    .where(
      and(
        eq(sourceReadings.sourceId, sourceId),
        gte(sourceReadings.slotTs, fromIso),
        lte(sourceReadings.slotTs, toIso),
      ),
    )
    .orderBy(sourceReadings.slotTs);
}
