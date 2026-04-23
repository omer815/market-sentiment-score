import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const snapshots = sqliteTable(
  'snapshots',
  {
    slotTs: text('slot_ts').notNull().primaryKey(),
    fetchedAt: text('fetched_at').notNull(),
    compositeScore: integer('composite_score'),
    status: text('status', { enum: ['complete', 'partial', 'no-data'] }).notNull(),
    failedSources: text('failed_sources').notNull().default(''),
  },
  (t) => ({
    slotIdx: index('idx_snapshots_slot_ts_desc').on(t.slotTs),
  }),
);

export const sourceReadings = sqliteTable(
  'source_readings',
  {
    slotTs: text('slot_ts').notNull(),
    sourceId: text('source_id', {
      enum: ['vix', 'cnn_fg', 'sp500', 's5fi'],
    }).notNull(),
    rawValue: real('raw_value'),
    flagTriggered: integer('flag_triggered'),
    normalisedValue: integer('normalised_value'),
    fetchStatus: text('fetch_status', {
      enum: ['ok', 'stale-source', 'fetch-failed', 'parse-failed', 'rate-limited'],
    }).notNull(),
    fetchError: text('fetch_error'),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.slotTs, t.sourceId] }),
    sourceSlotIdx: index('idx_readings_source_slot').on(t.sourceId, t.slotTs),
  }),
);

export const sourceMetadata = sqliteTable('source_metadata', {
  sourceId: text('source_id', {
    enum: ['vix', 'cnn_fg', 'sp500', 's5fi'],
  })
    .notNull()
    .primaryKey(),
  displayName: text('display_name').notNull(),
  description: text('description').notNull(),
  flagRule: text('flag_rule').notNull(),
  pointsOnTrigger: integer('points_on_trigger').notNull().default(25),
  updateCadence: text('update_cadence', { enum: ['30m', '1d'] }).notNull(),
});

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
export type SourceReading = typeof sourceReadings.$inferSelect;
export type NewSourceReading = typeof sourceReadings.$inferInsert;
export type SourceMetadata = typeof sourceMetadata.$inferSelect;
