# Phase 1 — Data Model

**Feature**: Market Sentiment Score Dashboard (`001-market-sentiment-score`)
**Storage**: Cloudflare D1 (SQLite)

## Entities

### `snapshots`

One row per clock-aligned 30-min slot. Immutable once inserted (no updates).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `slot_ts` | `TEXT` (ISO-8601 UTC, e.g. `2026-04-23T14:30:00Z`) | PRIMARY KEY | Clock-aligned slot time. `UNIQUE` enforces FR-008 dedup. |
| `fetched_at` | `TEXT` (ISO-8601 UTC) | NOT NULL | Wall-clock time the cron actually ran (may differ from `slot_ts` on retry). |
| `composite_score` | `INTEGER` | NULL allowed, CHECK IN (0, 25, 50, 75, 100) when NOT NULL | Sum of per-source flag points (0 or 25 each). NULL only if `status = 'no-data'`. |
| `status` | `TEXT` | NOT NULL, CHECK IN (`complete`, `partial`, `no-data`) | `complete` = all 4 sources OK; `partial` = 1–3 OK; `no-data` = 0 OK. |
| `failed_sources` | `TEXT` | NOT NULL, default `''` | Comma-separated list of source identifiers that failed this cycle (empty for `complete`). |

**Indexes**:
- PRIMARY KEY on `slot_ts` (also serves as the dedup unique key)
- `INDEX idx_snapshots_slot_ts_desc ON snapshots(slot_ts DESC)` — latest-first
  queries for the dashboard.

**Validation rules**:
- `slot_ts` MUST be divisible by `1800` seconds of UTC (00:00 or 30:00
  minutes, 00 seconds). Enforced in application code before insert.
- `composite_score` is NULL iff `status = 'no-data'`. Enforced by CHECK.
- `failed_sources` non-empty iff `status != 'complete'`.

**Lifecycle**: insert-only. No updates, no deletes in v1 (retention is
indefinite per spec Assumptions).

### `source_readings`

One row per (snapshot, source). Four rows per successful cycle; fewer is
not permitted — every source MUST produce a row even on failure (captures
the failure reason for history).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `slot_ts` | `TEXT` | NOT NULL, FK → `snapshots.slot_ts`, CASCADE | Pairs with `source_id` for primary key. |
| `source_id` | `TEXT` | NOT NULL, CHECK IN (`vix`, `cnn_fg`, `sp500`, `s5fi`) | Stable identifier. |
| `raw_value` | `REAL` | NULL allowed | Source's native value (e.g., VIX 28.4, S5FI 62.3). For `sp500` this is the most recent completed daily close. NULL iff fetch failed. |
| `flag_triggered` | `INTEGER` (0/1) | NULL allowed | Evaluation of the flag rule (1 = triggered, 0 = not triggered). NULL iff fetch failed. |
| `normalised_value` | `INTEGER` | NULL allowed, CHECK IN (0, 25) when NOT NULL | Points contribution to the composite: `25 * flag_triggered`. Stored denormalised so composite aggregation is a straight `SUM`. NULL iff fetch failed. |
| `fetch_status` | `TEXT` | NOT NULL, CHECK IN (`ok`, `stale-source`, `fetch-failed`, `parse-failed`, `rate-limited`) | Operational outcome. |
| `fetch_error` | `TEXT` | NULL allowed | Human-readable error detail (NULL when status = `ok`). |
| `fetched_at` | `TEXT` | NOT NULL | ISO-8601 UTC wall-clock when this source's request returned. |

**Primary key**: composite `(slot_ts, source_id)`.

**Indexes**:
- `INDEX idx_readings_source_slot ON source_readings(source_id, slot_ts DESC)`
  — per-source historical line queries.

**Validation rules**:
- `raw_value`, `flag_triggered`, and `normalised_value` are either all
  NULL (fetch failed) or all NOT NULL (fetch succeeded).
- `normalised_value = 25 * flag_triggered` — enforced in application code
  and verified by unit tests on `scoring/flags.ts`.
- `fetch_error` non-NULL iff `fetch_status != 'ok'`.
- `fetch_status = 'stale-source'` is permitted (counts as successful for
  composite scoring; covers market-closed S&P 500 / S5FI cases from spec
  edge-cases).
- `fetch_status IN ('fetch-failed', 'parse-failed', 'rate-limited')` means
  this source's flag is unevaluable and it contributes 0 points to the
  composite (FR-012).

### `source_metadata` (static, seeded once)

Not strictly required at runtime (the set is fixed to four sources) but
exposed via `GET /api/sources` so the frontend renders names and scale
legends from a single source of truth.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `source_id` | `TEXT` | PRIMARY KEY | Matches `source_readings.source_id`. |
| `display_name` | `TEXT` | NOT NULL | e.g., "CBOE VIX". |
| `description` | `TEXT` | NOT NULL | One-line user-facing description. |
| `flag_rule` | `TEXT` | NOT NULL | Human-readable rule (e.g., `VIX > 30`, `3 consecutive red daily closes`). Used in `ScoringBreakdown` UI per FR-017. |
| `points_on_trigger` | `INTEGER` | NOT NULL, default `25` | Points awarded when the flag is triggered. Fixed at 25 for v1. |
| `update_cadence` | `TEXT` | NOT NULL | `30m` (VIX, CNN F&G), `1d` (SP500 scoring, S5FI). |

Seeded by migration `0002_seed_sources.sql`. Weights are editable via a
follow-up migration without touching schema.

## Relationships

```text
snapshots (1) ───< source_readings (4 rows expected per snapshot)
                       │
                       └─── source_id ──> source_metadata (1)
```

Foreign-key `source_readings.slot_ts → snapshots.slot_ts ON DELETE CASCADE`
(cascade isn't exercised in v1 since deletes are forbidden, but it's
correct modelling).

## State transitions

A snapshot has three terminal states, all set at insert time; there are no
subsequent transitions.

```text
cron fires for slot T
      │
      ▼
fetch all 4 sources in parallel
      │
      ▼
for each successful source: evaluate flag rule → flag_triggered ∈ {0, 1}
                            normalised_value = 25 * flag_triggered
      │
      ▼
count successful (ok + stale-source): n ∈ [0, 4]
      │
      ├─ n == 4 ─────────────▶ snapshots.status = 'complete'
      │                         composite_score = SUM(normalised_value) ∈ {0,25,50,75,100}
      ├─ n ∈ [1, 3] ─────────▶ snapshots.status = 'partial'
      │                         composite_score = SUM(normalised_value) of successful only
      │                         (bounded above by 25 * n)
      │                         failed_sources = comma-joined ids of the rest
      └─ n == 0 ─────────────▶ snapshots.status = 'no-data'
                                composite_score = NULL
```

## Query patterns (used by API contracts)

- **latest snapshot**
  ```sql
  SELECT * FROM snapshots ORDER BY slot_ts DESC LIMIT 1;
  -- JOIN source_readings WHERE slot_ts = ?
  ```
- **range, raw 30-min (≤ 7 days)**
  ```sql
  SELECT * FROM snapshots
  WHERE slot_ts >= ? AND slot_ts < ?
  ORDER BY slot_ts;
  ```
- **range, 2-hour buckets (7–30 days)**
  ```sql
  SELECT
    strftime('%Y-%m-%dT%H:00:00Z',
      datetime(strftime('%s', slot_ts) / 7200 * 7200, 'unixepoch')) AS bucket_ts,
    AVG(composite_score) AS composite_score,
    MIN(status) AS status
  FROM snapshots
  WHERE slot_ts >= ? AND slot_ts < ?
  GROUP BY bucket_ts
  ORDER BY bucket_ts;
  ```
- **range, daily (> 30 days)**
  ```sql
  SELECT
    date(slot_ts) AS bucket_ts,
    AVG(composite_score) AS composite_score
  FROM snapshots
  WHERE slot_ts >= ? AND slot_ts < ?
  GROUP BY bucket_ts
  ORDER BY bucket_ts;
  ```

Per-source history replaces `composite_score` with
`AVG(normalised_value)` joined to `source_readings`.

## Migrations

```text
backend/src/storage/migrations/
├── 0001_init.sql             # snapshots, source_readings, indexes
└── 0002_seed_sources.sql     # source_metadata rows
```

Applied via `wrangler d1 migrations apply` in CI before deploy.
