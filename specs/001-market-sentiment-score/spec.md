# Feature Specification: Market Sentiment Score Dashboard

**Feature Branch**: `001-market-sentiment-score`
**Created**: 2026-04-23
**Status**: MVP implemented (User Story 1 only) — User Stories 2 and 3 are **not yet built**
**Input**: User description: "I want u create a website that do and show score of multiple sources in given time, I'm working of buy and sell. Need fetch data from VIX, CNN fear and greed, S&P 500 graph candels, C5FI grpah, And make s score of the values, Every 30 min and save that into a db so I can track the old data."

## Implementation Status (as of 2026-04-23)

Only the **MVP scope (User Story 1 — "See the current buy/sell score at a glance", P1)** has
been implemented. Nothing has been installed, deployed, or executed yet — all code is
source-only in the repo. No dev server, no `npm install`, no `wrangler` run against
Cloudflare, no D1 database created.

| Area | Status | Notes |
| ---- | ------ | ----- |
| Specs, plan, research, data model, contracts, quickstart, tasks (104 items) | ✅ Complete | `specs/001-market-sentiment-score/` |
| Constitution (code quality, testing, UX, performance) | ✅ Complete | `.specify/memory/constitution.md` v1.0.0 |
| Backend fetchers (VIX, CNN F&G, S5FI, S&P 500 daily) | ✅ Complete | Code only — never run |
| S&P 500 intraday fetcher (for US3 candles) | ✅ Scaffolded | Not wired into UI yet |
| Scoring (4 flag rules + composite 0/25/50/75/100) | ✅ Complete | Unit-tested |
| D1 schema + migrations (snapshots, source_readings, source_metadata) | ✅ Written | Not applied anywhere |
| Routes: `/api/health`, `/api/sources`, `/api/sources/:id`, `/api/snapshots`, `/api/snapshots/latest` | ✅ Complete | Not deployed |
| Cron handler (`scheduled`) on `0,30 * * * *` UTC | ✅ Written | Not deployed |
| Frontend: heatmap, scoring breakdown, flag rows, empty/error/stale/partial states | ✅ Complete | US1 scope |
| Frontend: auto-refresh polling (TanStack Query 30 s) | ✅ Complete | |
| Frontend: historical charts / range picker / S&P 500 candles | ❌ **Not built** | US3 work |
| US2 operational proof (2 h of live cron ticks, dedup under retries, "stale-source" propagation) | ❌ **Not verified** | Backend code is there; has never run against D1 |
| CI workflow (typecheck + lint + unit tests) | ✅ Present | `.github/workflows/ci.yml` |
| E2E / Playwright / axe accessibility tests | ❌ **Not built** | Tasks T096–T099 in `tasks.md` |
| Observability (Workers Analytics Engine, alerting) | ❌ **Not built** | Tasks T101–T103 |
| Deployment to Cloudflare (D1 create, migrations, Worker deploy, Pages deploy) | ❌ **Not done** | Steps in `README.md` |

**What's left to reach the full spec** lives in `specs/001-market-sentiment-score/tasks.md`:
roughly tasks T064–T104 (User Story 2, User Story 3, and polish/observability/E2E). US1
tasks T001–T063 are the part that now has source code — they are still unverified against
a running environment.

**Acceptance scenarios from US1 covered by code but not by live verification**: all three
(composite renders, partial renders, heatmap + flag breakdown render). The behaviour is
enforced by unit tests on the pure logic (flags, composite, slot rounding, S&P 500 daily
parsing) and by the UI-state contract in `contracts/ui-contract.md`, but no browser, no
Worker, and no D1 have been exercised end-to-end.

## Clarifications

### Session 2026-04-23

- Q: Where will the fetcher and site be hosted? → A: Free-tier cloud (serverless).
- Q: How is the CNN Fear & Greed value acquired? → A: Prefer free third-party aggregator JSON endpoint; direct scrape of CNN only as fallback if no free aggregator is viable at planning time.
- Q: How is access to the dashboard protected in v1? → A: Public — no authentication, no allow-list. The composite and history are freely readable by anyone with the URL.
- Q: When a source fetch fails in a cycle, how is the composite computed? → A: Exclude the failed source(s) from the average; compute the composite from the remaining successful sources and flag the snapshot `partial`. Never silently carry forward stale values into the composite.
- Q: Are the 30-minute fetch slots clock-aligned? → A: Yes — aligned to `:00` and `:30` UTC. Each snapshot's slot timestamp is the scheduled slot (not the actual fetch moment) so historical rows are deterministic and join cleanly with standard 30-minute market bars.
- Q: What is the composite scoring formula? → A: Four binary flags worth 25 points each (composite ∈ {0, 25, 50, 75, 100}): **+25** if VIX > 30; **+25** if CNN Fear & Greed < 20; **+25** if S5FI < 20; **+25** if the S&P 500 has closed red (down vs. prior close) for **at least 3 consecutive completed trading days** (a streak of 4, 5 or more also triggers). A flag that cannot be evaluated (source fetch failed) contributes 0 and the snapshot is flagged `partial`.
- Q: How is the final score displayed? → A: As a red-to-green heatmap where 0 = red, 50 = yellow, 100 = green, with intermediate discrete stops at 25 and 75. Each flag is also shown individually with ✓/✗ and its current raw value + threshold, so the user can see which conditions contributed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the current buy/sell score at a glance (Priority: P1)

As a retail trader about to make a buy-or-sell decision, I open the dashboard
and within seconds see a single "buy/sell" score that summarises today's market
sentiment, alongside the individual source values that drive it, so I can
quickly form a view on whether the market is currently leaning toward fear
(buy opportunity) or greed (sell opportunity).

**Why this priority**: This is the entire value proposition. Without a current
composite score visible on arrival, there is no product. Every other story
only adds depth to this moment.

**Independent Test**: Open the dashboard in a browser after the backend has
completed at least one fetch cycle; verify that the current composite score
and each of the four source readings are shown with a timestamp of the last
update. Delivers immediate decision-support value on its own.

**Acceptance Scenarios**:

1. **Given** the backend has completed at least one successful fetch cycle,
   **When** the user opens the dashboard home page,
   **Then** a single composite score is rendered prominently (numeric value
   plus a visual cue of buy/neutral/sell leaning) and the four source values
   (VIX, CNN Fear & Greed, S&P 500 summary, S5FI) are rendered
   beside it with the timestamp of the latest fetch.
2. **Given** the dashboard is open,
   **When** one or more source fetches fail in the most recent cycle,
   **Then** the composite is still shown (computed from the successful
   sources), flagged as "partial", and the failed sources are clearly marked
   with their failure state and time.
3. **Given** the dashboard is open,
   **When** the user looks at the score,
   **Then** the composite score is rendered as a red-to-green heatmap (0
   = red, 100 = green) and a text label conveys the same leaning (e.g.,
   "Strong buy" at 100, "Neutral" at 50, "Strong sell/caution" at 0),
   and each of the four flags is visibly listed with its threshold rule,
   current raw value, ✓/✗ state, and points contribution.

---

### User Story 2 - Automatic refresh and durable history (Priority: P2)

As a trader who checks the dashboard multiple times a day, I want the system
to poll every source every 30 minutes and record each reading permanently, so
that every time I return the latest data is waiting and I can review how
sentiment has moved since I last looked.

**Why this priority**: Without automated polling and persistence, the score
becomes stale between visits and no history can be reviewed. This is the
foundation that Story 3 builds on, but Story 1 can technically ship with
on-demand fetches, so this is P2 rather than P1.

**Independent Test**: Leave the system running for 2 hours; verify that
exactly four fetch cycles have been recorded in storage (one per 30-minute
slot), each with values for every source plus the composite, and that the
dashboard shows the most recent one without a manual refresh.

**Acceptance Scenarios**:

1. **Given** the system is running,
   **When** 30 minutes have elapsed since the last fetch cycle,
   **Then** a new fetch cycle is triggered automatically and a new snapshot
   is persisted with the current timestamp, per-source values, per-source
   fetch status, and the composite score.
2. **Given** an individual source fetch fails in a given cycle,
   **When** the cycle completes,
   **Then** the snapshot is still persisted with the failed source marked
   as failed, the composite is computed from only the successful sources
   (the failed source's value is excluded — never carried forward), the
   snapshot is flagged `partial`, and the failure is recorded so history
   shows the gap.
3. **Given** a new snapshot has been persisted,
   **When** the user's dashboard is open,
   **Then** the display updates to the new snapshot within one refresh
   interval without the user having to reload the page manually.

---

### User Story 3 - Review historical trend (Priority: P3)

As a trader who wants to learn from past moves, I want to view how the
composite score and each individual source have changed over a range I
select (last 24 hours, 7 days, 30 days, custom), so I can spot divergences,
see where sentiment peaked or bottomed, and correlate readings with my
past trades.

**Why this priority**: History is what turns a live gauge into a tracking
tool. It is the third most valuable capability but strictly depends on
Story 2 (which produces the data to chart).

**Independent Test**: With at least 7 days of persisted snapshots, select
the "7 days" range and verify that a time-series chart renders showing the
composite score and each source over that range, with no gaps other than
upstream-outage gaps, and that the values shown match the persisted
snapshots.

**Acceptance Scenarios**:

1. **Given** the system has persisted snapshots over at least the selected
   range, **When** the user picks a time range,
   **Then** a chart is rendered showing the composite score and each source
   plotted over that range, with the x-axis labelled in time and the y-axis
   labelled with the score scale.
2. **Given** there were upstream-source failures inside the selected range,
   **When** the chart renders,
   **Then** those gaps are visibly indicated (e.g., broken line or marker)
   rather than silently interpolated.
3. **Given** a very long range is selected (e.g., "all time"),
   **When** the chart renders,
   **Then** the view returns in a reasonable time and remains legible
   (through down-sampling or aggregation) rather than plotting every raw
   point.

---

### Edge Cases

- **Market closed / weekend**: VIX and S&P 500 candles do not update outside
  trading hours. The system must not treat a non-update as a failed fetch;
  it should carry forward the last published value and clearly indicate the
  "stale" state in the UI.
- **Upstream format change**: A source silently changes its response shape
  and the system can no longer parse it. The fetch must be marked failed,
  not produce a garbage value that feeds into the composite.
- **Clock skew or double-trigger**: Two fetch cycles could fire close
  together (e.g., after a retry). The system must not persist duplicate
  snapshots for the same 30-minute slot.
- **Upstream rate limits**: A source may rate-limit or block the fetcher.
  The system must back off and surface the block as a fetch failure.
- **First load with no data**: The first time the site is opened (before
  any fetch has completed), the dashboard must show an explicit "no data
  yet" state rather than a blank frame or a zero score.
- **Very long history**: After a year of continuous 30-minute polling,
  historical queries over wide ranges must still return quickly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch the current VIX value on a 30-minute
  schedule.
- **FR-002**: System MUST fetch the current CNN Fear & Greed Index value on
  a 30-minute schedule. The primary acquisition path is a free third-party
  aggregator JSON endpoint; if no free aggregator is viable at planning
  time, the system MAY fall back to scraping CNN's public index page.
  Direct use of any paid API is out of scope per the free-tier constraint.
- **FR-003**: System MUST fetch two S&P 500 data series on a 30-minute
  schedule: (a) the last ~4 completed **daily** close values (used to
  evaluate the "3 red days in a row" flag for scoring), and (b) the last
  day's **30-minute candlestick** series (open/high/low/close), used to
  render the candle chart in the historical view (US3). Only (a) feeds the
  composite score; (b) is UI-only.
- **FR-004**: System MUST fetch the current value of the **S5FI** indicator
  (S&P 500 Percent of Stocks Above 50-Day Moving Average — a market-breadth
  gauge) on a 30-minute schedule. The raw value is a percentage in the
  range 0–100%.
- **FR-005**: System MUST compute the composite score on every fetch cycle
  as the sum of four binary flags, each worth 25 points, producing a
  composite in `{0, 25, 50, 75, 100}`. The four flags are:
  - **+25** if the latest VIX value is **greater than 30**.
  - **+25** if the latest CNN Fear & Greed Index value is **less than 20**.
  - **+25** if the latest S5FI value is **less than 20**.
  - **+25** if the S&P 500 has closed **red** (daily close below the prior
    day's close) for **at least 3 consecutive completed trading days**
    immediately preceding the current moment. A longer streak (4, 5, or
    more consecutive red closes) also satisfies the flag — the rule is
    "≥ 3", not "exactly 3".
- **FR-006**: Each source MUST have a documented threshold rule (operator
  + threshold value) that determines whether its flag is triggered. The
  points awarded per source MUST be exactly 0 or 25; no partial credit.
  Threshold values MUST be configurable without a code or schema change.
- **FR-007**: System MUST persist every fetch cycle as a snapshot
  containing: timestamp, per-source raw value, per-source
  `flag_triggered` boolean, per-source points contribution (0 or 25),
  per-source fetch status (success/failure with reason), the composite
  score (sum of points), and a flag indicating whether the snapshot is
  `complete`, `partial`, or `no-data`.
- **FR-008**: Fetch slots MUST be clock-aligned to `:00` and `:30` UTC.
  Each persisted snapshot MUST be keyed by its scheduled slot timestamp
  (not the wall-clock moment the fetch ran), and the system MUST NOT
  persist duplicate snapshots for the same slot even if the fetch is
  triggered more than once (e.g., by a retry). Late-running fetches still
  record under the scheduled slot they belong to.
- **FR-009**: The dashboard MUST be publicly accessible on the web with no
  authentication in v1 (anyone with the URL can view the composite score,
  individual sources, and historical charts). No user accounts, passwords,
  or IP restrictions are introduced.
- **FR-010**: Users MUST be able to view the current value of each
  individual source alongside the composite, with the timestamp of the
  latest successful fetch per source.
- **FR-011**: Users MUST be able to view historical composite scores and
  per-source values over a selectable time range (at minimum: last 24 h,
  last 7 days, last 30 days, all time).
- **FR-012**: System MUST continue to compute and display a composite
  score when one or more sources fail. A source whose fetch failed
  contributes 0 points to the composite (its flag cannot be evaluated and
  therefore is treated as "not triggered"). The snapshot MUST be flagged
  `partial` and the failed sources MUST be identified by name in both the
  persisted snapshot and the UI so the user understands the composite is
  bounded above by `25 × (4 − n_failed)`. If all four sources fail in a
  cycle, the composite MUST NOT be computed for that cycle; the snapshot
  is recorded with status `no-data` and the UI shows the previous
  composite with an explicit "last successful at ..." label.
- **FR-013**: System MUST record fetch failures (per source, per cycle) so
  that gaps are observable in historical views rather than silently
  hidden.
- **FR-014**: System MUST display, on every view, the timestamp of the most
  recent successful fetch and a clear indication when data is stale (e.g.,
  fetch has not succeeded within the last cycle).
- **FR-015**: The dashboard view MUST update to reflect a new persisted
  snapshot without requiring the user to reload the page.
- **FR-016**: The composite score MUST be rendered as a red-to-green
  heatmap where **0 = red** (no conditions met — strong sell/caution) and
  **100 = green** (all four conditions met — strong buy). The discrete
  intermediate stops `25`, `50`, and `75` MUST each have a distinct,
  visibly-distinguishable colour between red and green (e.g., red →
  orange → yellow → yellow-green → green). The colour MUST NOT be the
  only indicator of state — the numeric value and a short text label
  (e.g., "Strong buy", "Neutral") MUST also be rendered for accessibility
  per Principle III.
- **FR-017**: The UI MUST show the four flags individually alongside the
  composite heatmap. For each flag the UI MUST display: the source name,
  the threshold rule (e.g., "VIX > 30"), the current raw value, whether
  the flag is triggered (✓ / ✗), and how many points it contributed (0
  or 25). If the source's fetch failed, the flag row MUST display the
  failure state instead of a ✗, so the user can distinguish "flag not
  triggered" from "flag not evaluated".

### Key Entities *(include if feature involves data)*

- **Data Source**: represents one of the four upstream feeds (VIX, CNN
  Fear & Greed, S&P 500 daily closes, S5FI). Attributes: identifier,
  display name, expected update cadence, **flag rule** (operator +
  threshold, e.g., `VIX > 30`), points awarded on trigger (fixed at 25
  for v1), current operational status.
- **Fetch Snapshot**: represents a single 30-minute data capture across
  all sources. Attributes: captured-at timestamp, per-source raw value,
  per-source `flag_triggered` boolean, per-source points contribution (0
  or 25), per-source fetch status with error reason, composite score (sum
  of points, ∈ {0, 25, 50, 75, 100}), partial/complete flag.
- **Score Series**: a time-ordered view over Fetch Snapshots, used to
  render historical charts. Attributes: selected source (or composite),
  selected time range, sampling resolution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On first visit to the dashboard (after at least one snapshot
  exists), a user can identify the current buy/sell leaning within 5
  seconds of the page loading.
- **SC-002**: At least 95% of scheduled 30-minute fetch cycles complete
  successfully (all sources) over any rolling 7-day window, under normal
  upstream availability.
- **SC-003**: 100% of completed fetch cycles are persisted and queryable
  afterwards; no cycle is lost to the database.
- **SC-004**: A user can load a 30-day historical view of the composite
  score and all sources and see the chart rendered within 3 seconds of
  selecting the range.
- **SC-005**: When exactly one upstream source is unavailable, a partial
  composite score is still rendered within one 30-minute cycle of the
  outage starting.
- **SC-006**: Over a 6-month period, at least 90% of all originally-captured
  snapshots are still queryable (i.e., historical data is retained
  reliably, not aged out silently).
- **SC-007**: The dashboard is usable on both a standard desktop browser
  (≥1280×720) and a modern mobile browser (≥375×667) without horizontal
  scrolling on primary views.

## Assumptions

- **Audience & access**: The dashboard's primary user is a single retail
  trader, but v1 is published publicly with no authentication or
  allow-list — the displayed data (composite score, per-source readings,
  and history) is non-sensitive market-sentiment information. User
  accounts and per-user state are out of scope for v1 and can be added
  later without redesign.
- **Score scale**: The composite score is on a 0–100 scale where 0 = no
  conditions triggered (caution / strong sell) and 100 = all four
  conditions triggered (strong buy). Because the formula sums four 25-
  point flags, the composite is always a discrete member of
  `{0, 25, 50, 75, 100}`. It is rendered as a red-to-green heatmap per
  FR-016.
- **Scoring formula**: Fixed by the four flags in FR-005 — VIX > 30,
  CNN F&G < 20, S5FI < 20, and three consecutive red S&P 500 daily
  closes. Each flag is binary and worth 25 points. Thresholds (the
  comparison values `30`, `20`, `20`, and the "3 red days" count) are
  runtime-configurable via environment variables so tuning does not
  require a code or schema change.
- **Polling cadence**: Fetches run continuously 24/7 at 30-minute intervals.
  Outside market hours, sources that only update during trading hours (e.g.,
  S&P 500 candles, VIX) will simply re-report the last published value, and
  the snapshot is flagged "stale-source" rather than "failed".
- **Historical retention**: All snapshots are retained indefinitely for v1
  (at 30-minute cadence, the data volume is small — about 17,500 rows per
  source per year).
- **S&P 500 scoring vs. display**: Scoring uses **daily** closes (to
  evaluate the "3 red days in a row" flag from FR-005). The candle chart
  shown in the historical view (US3) uses **30-minute** intraday bars for
  visual detail. Both series are fetched in every cycle. Because the
  daily flag only changes at most once per trading day (after market
  close), it is expected to produce the same result across many
  consecutive 30-min cycles between daily closes.
- **Data providers**: Upstream feeds are reached via publicly available
  endpoints or an affordable consumer market-data provider. Provider
  selection is a planning-phase decision.
- **Deployment model**: The fetcher, database, and web UI MUST run on a
  free-tier cloud / serverless stack (e.g., Cloudflare Workers + Cron
  Triggers + D1/Turso, or equivalent free-forever managed PaaS). No
  always-on VM, laptop, or paid tier is to be introduced in v1. The
  scheduling mechanism MUST be a managed cron/scheduled-task feature of
  the chosen platform so the 30-minute cadence runs without a dedicated
  always-on process.
- **Time zone**: All timestamps are stored in UTC and displayed in the
  user's local time zone.
