export type SourceId = 'vix' | 'cnn_fg' | 'sp500' | 's5fi';

export type FetchStatus =
  | 'ok'
  | 'stale-source'
  | 'fetch-failed'
  | 'parse-failed'
  | 'rate-limited';

export type SnapshotStatus = 'complete' | 'partial' | 'no-data';

export interface SourceMetadata {
  source_id: SourceId;
  display_name: string;
  description: string;
  flag_rule: string;
  points_on_trigger: number;
  update_cadence: '30m' | '1d';
}

export interface SourceReading {
  source_id: SourceId;
  raw_value: number | null;
  flag_triggered: 0 | 1 | null;
  normalised_value: 0 | 25 | null;
  fetch_status: FetchStatus;
  fetch_error: string | null;
  fetched_at: string;
}

export interface Snapshot {
  slot_ts: string;
  fetched_at: string;
  composite_score: 0 | 25 | 50 | 75 | 100 | null;
  status: SnapshotStatus;
  failed_sources: SourceId[];
  readings: SourceReading[];
}

export interface Health {
  status: 'ok' | 'degraded';
  last_cycle_at: string | null;
  last_cycle_status: SnapshotStatus | null;
}

/**
 * POST /api/snapshots/refresh response shapes.
 *  - 201: the Snapshot with `inserted: true`
 *  - 200: `{slot_ts, inserted: false, snapshot: Snapshot}`
 *  - 502: upstream-failed error
 */
export type RefreshResponse =
  | ({ inserted: true } & Snapshot)
  | { slot_ts: string; inserted: false; snapshot: Snapshot };

export interface ApiError {
  error: string;
  message?: string;
  detail?: string;
}
