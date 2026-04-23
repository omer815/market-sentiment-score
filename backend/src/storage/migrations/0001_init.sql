-- 0001_init.sql
-- Schema for the Market Sentiment Score Dashboard.
-- See specs/001-market-sentiment-score/data-model.md for the full contract.

CREATE TABLE snapshots (
  slot_ts          TEXT    NOT NULL PRIMARY KEY,
  fetched_at       TEXT    NOT NULL,
  composite_score  INTEGER,
  status           TEXT    NOT NULL,
  failed_sources   TEXT    NOT NULL DEFAULT '',
  CHECK (status IN ('complete', 'partial', 'no-data')),
  CHECK (composite_score IS NULL OR composite_score IN (0, 25, 50, 75, 100)),
  CHECK ((status = 'no-data' AND composite_score IS NULL)
      OR (status <> 'no-data' AND composite_score IS NOT NULL))
);

CREATE INDEX idx_snapshots_slot_ts_desc ON snapshots (slot_ts DESC);

CREATE TABLE source_readings (
  slot_ts           TEXT    NOT NULL,
  source_id         TEXT    NOT NULL,
  raw_value         REAL,
  flag_triggered    INTEGER,
  normalised_value  INTEGER,
  fetch_status      TEXT    NOT NULL,
  fetch_error       TEXT,
  fetched_at        TEXT    NOT NULL,
  PRIMARY KEY (slot_ts, source_id),
  FOREIGN KEY (slot_ts) REFERENCES snapshots (slot_ts) ON DELETE CASCADE,
  CHECK (source_id IN ('vix', 'cnn_fg', 'sp500', 's5fi')),
  CHECK (fetch_status IN ('ok', 'stale-source', 'fetch-failed', 'parse-failed', 'rate-limited')),
  CHECK (flag_triggered IS NULL OR flag_triggered IN (0, 1)),
  CHECK (normalised_value IS NULL OR normalised_value IN (0, 25)),
  -- raw_value, flag_triggered, normalised_value must all be NULL or all non-NULL
  CHECK (
    (raw_value IS NULL AND flag_triggered IS NULL AND normalised_value IS NULL)
    OR
    (raw_value IS NOT NULL AND flag_triggered IS NOT NULL AND normalised_value IS NOT NULL)
  ),
  -- normalised_value = 25 * flag_triggered
  CHECK (normalised_value IS NULL OR normalised_value = 25 * flag_triggered),
  -- fetch_error non-NULL iff fetch_status != 'ok'
  CHECK (
    (fetch_status = 'ok' AND fetch_error IS NULL)
    OR (fetch_status <> 'ok')
  )
);

CREATE INDEX idx_readings_source_slot ON source_readings (source_id, slot_ts DESC);

CREATE TABLE source_metadata (
  source_id          TEXT    NOT NULL PRIMARY KEY,
  display_name       TEXT    NOT NULL,
  description        TEXT    NOT NULL,
  flag_rule          TEXT    NOT NULL,
  points_on_trigger  INTEGER NOT NULL DEFAULT 25,
  update_cadence     TEXT    NOT NULL,
  CHECK (source_id IN ('vix', 'cnn_fg', 'sp500', 's5fi')),
  CHECK (update_cadence IN ('30m', '1d'))
);
