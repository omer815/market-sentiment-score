---
description: "Task list for the Market Sentiment Score Dashboard feature"
---

# Tasks: Market Sentiment Score Dashboard

**Input**: Design documents from `/specs/001-market-sentiment-score/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Tests are **included** — Constitution Principle II (Testing Standards) is NON-NEGOTIABLE for this project. Each user-visible behavior must have a failing test written before the implementation that makes it pass.

**Organization**: Tasks are grouped by user story. User Story 1 (P1) is the MVP; Story 2 (P2) adds automated refresh + persistence; Story 3 (P3) adds history.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on uncompleted tasks)
- **[Story]**: Maps task to a user story (US1, US2, US3). Setup / Foundational / Polish tasks have no story label.
- All file paths are repo-relative.

## Path Conventions

- Backend Worker: `backend/src/`, tests in `backend/tests/`
- Frontend SPA: `frontend/src/`, tests in `frontend/tests/`
- Specs and contracts: `specs/001-market-sentiment-score/`
- CI: `.github/workflows/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding and tooling before any feature code is written.

- [ ] T001 Create monorepo layout with `backend/` and `frontend/` workspaces at repository root; add root `package.json` with `pnpm` workspace config in `package.json` and `pnpm-workspace.yaml`
- [ ] T002 [P] Add shared TypeScript base config at `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`
- [ ] T003 [P] Add shared ESLint config at `.eslintrc.cjs` with `@typescript-eslint/strict-type-checked` and `eslint-plugin-sonarjs`; add Prettier config at `.prettierrc.json`
- [ ] T004 [P] Add root `.gitignore`, `.nvmrc` (Node 20 LTS), `.editorconfig`
- [ ] T005 Initialise backend workspace at `backend/package.json` with deps: `hono`, `zod`, `drizzle-orm`, `@cloudflare/workers-types`; dev-deps: `wrangler`, `miniflare`, `vitest`, `@cloudflare/vitest-pool-workers`
- [ ] T006 Initialise frontend workspace at `frontend/package.json` with deps: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `recharts`, `lightweight-charts`, `zod`; dev-deps: `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/react`, `@playwright/test`, `@axe-core/playwright`
- [ ] T007 [P] Create Vite config at `frontend/vite.config.ts` with React plugin, `@` path alias, and dev server port `5173`
- [ ] T008 [P] Create Wrangler config at `backend/wrangler.toml` with `[triggers] crons = ["0,30 * * * *"]`, D1 binding stub, and `compatibility_date = "2026-04-01"`
- [ ] T009 [P] Create GitHub Actions CI skeleton at `.github/workflows/ci.yml` running on PR: install → lint → typecheck → unit → integration → build (detailed gates added in Polish phase)
- [ ] T010 [P] Add typed OpenAPI client generation script at `frontend/scripts/gen-api-client.ts` that reads `specs/001-market-sentiment-score/contracts/openapi.yaml` and emits `frontend/src/lib/api-types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, Worker entrypoint, shared libraries, frontend shell. **No user story work can begin until this phase is complete.**

### Database & schema

- [ ] T011 Create initial migration at `backend/src/storage/migrations/0001_init.sql` defining `snapshots` (PK `slot_ts`, CHECK on `status`, CHECK on `composite_score` ∈ {NULL,0,25,50,75,100}) and `source_readings` (composite PK `(slot_ts, source_id)`, CHECK on `fetch_status`, CHECK on `normalised_value` ∈ {NULL,0,25}) with indexes `idx_snapshots_slot_ts_desc` and `idx_readings_source_slot`
- [ ] T012 Create seed migration at `backend/src/storage/migrations/0002_seed_sources.sql` inserting four rows into `source_metadata` (vix, cnn_fg, sp500, s5fi) with `flag_rule`, `points_on_trigger=25`, and `update_cadence` per data-model.md
- [ ] T013 Add Drizzle schema definitions at `backend/src/storage/schema.ts` mirroring the migrations (snapshots, source_readings, source_metadata) with typed columns
- [ ] T014 Add migration runner script at `backend/scripts/migrate.ts` + npm scripts `db:migrate` and `db:migrate:local` in `backend/package.json`

### Backend core libraries

- [ ] T015 [P] Implement slot-rounding helper at `backend/src/lib/slot.ts` exporting `roundToSlot(date: Date): string` that returns ISO UTC rounded down to :00 or :30
- [ ] T016 [P] Add ISO time helpers at `backend/src/lib/time.ts` (nowIso, relativeTime, toIso) with matching unit tests at `backend/tests/unit/time.test.ts`
- [ ] T017 [P] Define fetch error taxonomy at `backend/src/lib/errors.ts` exporting the `FetchStatus` union `'ok' | 'stale-source' | 'fetch-failed' | 'parse-failed' | 'rate-limited'` and helper constructors
- [ ] T018 [P] Add configuration module at `backend/src/config.ts` reading env vars `VIX_THRESHOLD` (default 30), `FG_THRESHOLD` (20), `S5FI_THRESHOLD` (20), `SP500_RED_DAYS_MIN` (3) with Zod parse-and-default
- [ ] T019 [P] Add shared fetcher types at `backend/src/fetchers/types.ts` exporting `FetchResult<T>` discriminated union (`ok` | failure variants) and `SourceId`

### Backend Worker entry & health

- [ ] T020 Wire up the Worker entry point at `backend/src/worker.ts` exporting default `{ fetch, scheduled }` handlers; `fetch` delegates to Hono router, `scheduled` delegates to cron handler (implemented later)
- [ ] T021 Create Hono router at `backend/src/router.ts` mounting stub routes for `/api/health`, `/api/sources`, `/api/snapshots/latest`, `/api/snapshots`, `/api/sources/:sourceId`
- [ ] T022 Implement health endpoint at `backend/src/routes/health.ts` returning `{ status, last_cycle_at, last_cycle_status }` (reads the most recent snapshot)
- [ ] T023 Add integration test at `backend/tests/integration/health.test.ts` using Miniflare + local D1 that verifies `GET /api/health` returns 200 with correct shape on an empty DB

### Frontend shell

- [ ] T024 [P] Create design tokens at `frontend/src/styles/tokens.css` defining `--heatmap-0`..`--heatmap-100` colour variables plus spacing/typography tokens per ui-contract.md
- [ ] T025 [P] Create centralised copy catalogue at `frontend/src/lib/copy.ts` seeded with every key listed in ui-contract.md (`composite.label.{0|25|50|75|100}`, `flag.*`, `dashboard.empty`, `history.empty`, `stale.banner`, `partial.badge`)
- [ ] T026 [P] Implement typed API client wrapper at `frontend/src/lib/api.ts` using the generated `api-types.ts`, exposing `getLatest()`, `getHealth()`, `getSources()`, `getSnapshots({from,to,resolution})`, `getSourceReadings({sourceId,...})`
- [ ] T027 Create `frontend/src/main.tsx` bootstrapping React 18 + TanStack Query client + React Router; mount `App.tsx`
- [ ] T028 Create `frontend/src/App.tsx` with route map (`/` → Dashboard stub, `/history` → History stub) and a top-level `<ErrorBoundary>` using `frontend/src/components/ErrorState.tsx`
- [ ] T029 [P] Create reusable state components at `frontend/src/components/EmptyState.tsx`, `frontend/src/components/ErrorState.tsx`, `frontend/src/components/StaleBadge.tsx`, `frontend/src/components/PartialBadge.tsx` each with a matching snapshot test at `frontend/tests/unit/<name>.test.tsx`

### Test harness

- [ ] T030 [P] Configure backend Vitest at `backend/vitest.config.ts` with `@cloudflare/vitest-pool-workers` for integration tests and plain node pool for unit tests
- [ ] T031 [P] Configure frontend Vitest at `frontend/vitest.config.ts` with jsdom environment and Testing Library setup file `frontend/tests/setup.ts`
- [ ] T032 [P] Configure Playwright at `frontend/playwright.config.ts` with single project (`chromium`), baseURL from env, zero retries in CI, axe-core import helper at `frontend/tests/e2e/a11y.ts`

**Checkpoint**: Foundation complete. DB migrations run locally, Worker serves `/api/health`, frontend shell renders a blank router. User story work can now begin.

---

## Phase 3: User Story 1 — See the current buy/sell score at a glance (Priority: P1) 🎯 MVP

**Goal**: User opens `/`, sees composite heatmap + 4 flag rows within 5 seconds, with timestamp of the latest fetch.

**Independent Test**: Manually trigger the cron (via `curl -X POST /__scheduled`) once; open `http://localhost:5173/`; verify composite score (one of {0,25,50,75,100}) + heatmap colour + text label + each flag row (rule, raw value, ✓/✗, points) renders in < 5 s.

### Tests for User Story 1 ⚠️

> Write these tests FIRST and confirm they fail before implementing.

- [ ] T033 [P] [US1] Unit test for VIX parser at `backend/tests/unit/fetchers/vix.test.ts` using fixtures in `backend/tests/fixtures/vix/` — parses a Yahoo Finance chart response and asserts `raw_value` + `fetched_at`
- [ ] T034 [P] [US1] Unit test for CNN F&G parser at `backend/tests/unit/fetchers/cnn-fg.test.ts` using fixtures in `backend/tests/fixtures/cnn-fg/`
- [ ] T035 [P] [US1] Unit test for S&P 500 daily parser at `backend/tests/unit/fetchers/sp500-daily.test.ts` using fixtures in `backend/tests/fixtures/sp500/` covering: a fresh trading day, market-closed carry-forward, missing bars
- [ ] T036 [P] [US1] Unit test for S5FI parser at `backend/tests/unit/fetchers/s5fi.test.ts` using fixtures in `backend/tests/fixtures/s5fi/`
- [ ] T037 [P] [US1] Unit test for scoring flags at `backend/tests/unit/scoring/flags.test.ts` covering: VIX>30 edges (29.9, 30.0, 30.1), F&G<20 edges (19, 20, 21), S5FI<20 edges, SP500 red-streak (2 reds = false, 3 reds = true, 4 reds = true, 3 reds broken by a green = false), thresholds pulled from config
- [ ] T038 [P] [US1] Unit test for composite computation at `backend/tests/unit/scoring/composite.test.ts` covering: all 4 triggered → 100, none triggered → 0, 2 triggered → 50, one fetch failed + two flags triggered → 50 with `status='partial'`, all failed → `status='no-data'` composite null
- [ ] T039 [P] [US1] Unit test for snapshot persistence at `backend/tests/unit/storage/snapshots.test.ts` using an in-memory better-sqlite3 instance — asserts insert + dedup-on-duplicate-slot + foreign-key cascade
- [ ] T040 [US1] Integration test for full cron cycle at `backend/tests/integration/cron.test.ts` using Miniflare + local D1 — all 4 fetchers mocked at the `fetch()` boundary via fixtures; asserts one row in `snapshots`, four rows in `source_readings`, composite_score matches the flags
- [ ] T041 [P] [US1] Integration test for `/api/sources` at `backend/tests/integration/sources.api.test.ts` — asserts response matches `openapi.yaml` SourceMetadata schema for all 4 sources
- [ ] T042 [P] [US1] Integration test for `/api/snapshots/latest` at `backend/tests/integration/snapshots-latest.api.test.ts` — seeds a snapshot, asserts 200 with correct shape; empty DB returns 204
- [ ] T043 [P] [US1] Component test for `<CompositeHeatmap>` at `frontend/tests/unit/CompositeHeatmap.test.tsx` — renders correct stop for each score value, includes numeric + label + aria-label for accessibility
- [ ] T044 [P] [US1] Component test for `<ScoringBreakdown>` + `<FlagRow>` at `frontend/tests/unit/ScoringBreakdown.test.tsx` — renders all 4 flags in fixed order, ✓/✗/not-evaluated states distinct, points column correct
- [ ] T045 [P] [US1] E2E test at `frontend/tests/e2e/dashboard.spec.ts` — seeds a snapshot via API stub, loads `/`, asserts heatmap visible + breakdown rows + timestamp + axe-core violations = 0

### Implementation for User Story 1

#### Fetchers

- [ ] T046 [P] [US1] Implement VIX fetcher at `backend/src/fetchers/vix.ts` calling `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=30m&range=1d` and returning `FetchResult<{ raw_value, fetched_at }>`
- [ ] T047 [P] [US1] Implement CNN F&G fetcher at `backend/src/fetchers/cnn-fg.ts` calling `https://production.dataviz.cnn.io/index/fearandgreed/graphdata` with `User-Agent: Mozilla/5.0` + `Accept: application/json` headers; surfaces `fetch-failed` on non-200 or unparseable body
- [ ] T048 [P] [US1] Implement S&P 500 daily fetcher at `backend/src/fetchers/sp500-daily.ts` calling `…/v8/finance/chart/%5EGSPC?interval=1d&range=10d`, returning the last 7 **completed** daily closes as an array
- [ ] T049 [P] [US1] Implement S&P 500 intraday fetcher at `backend/src/fetchers/sp500-intraday.ts` calling `…/v8/finance/chart/%5EGSPC?interval=30m&range=5d` (used later by US3 candle chart — stub its wiring now, full use in US3)
- [ ] T050 [P] [US1] Implement S5FI fetcher at `backend/src/fetchers/s5fi.ts` calling `…/v8/finance/chart/%5ES5FI?interval=1d&range=5d`; marks `stale-source` if the most recent close is older than 36 hours (covers market-closed weekends)

#### Scoring

- [ ] T051 [US1] Implement flag rules at `backend/src/scoring/flags.ts` — four pure functions: `evaluateVix(raw, cfg)`, `evaluateFg(raw, cfg)`, `evaluateS5fi(raw, cfg)`, `evaluateSp500(dailyCloses, cfg)` (tail-streak ≥ `SP500_RED_DAYS_MIN`) each returning `{ flag_triggered: boolean; points: 0|25 }`
- [ ] T052 [US1] Implement composite computation at `backend/src/scoring/composite.ts` exporting `computeComposite(readings): { composite_score: number|null; status: 'complete'|'partial'|'no-data'; failed_sources: string[] }`

#### Storage

- [ ] T053 [US1] Implement snapshot writer at `backend/src/storage/snapshots.ts` exporting `insertSnapshot(db, slotTs, readings, composite)` that writes one `snapshots` row + four `source_readings` rows in a single transaction, using `INSERT ... ON CONFLICT(slot_ts) DO NOTHING` to enforce FR-008 dedup
- [ ] T054 [US1] Implement snapshot readers at `backend/src/storage/snapshots.ts` exporting `getLatest(db)` (joins `snapshots` + `source_readings` by slot_ts) and `getSnapshot(db, slotTs)`

#### Cron cycle

- [ ] T055 [US1] Implement cron handler at `backend/src/cron.ts` that: (a) computes current slot via `slot.ts`, (b) dispatches all 4 fetchers in parallel via `Promise.allSettled`, (c) evaluates each flag via `scoring/flags.ts`, (d) computes composite via `scoring/composite.ts`, (e) writes snapshot via `storage/snapshots.ts`
- [ ] T056 [US1] Wire `scheduled` handler in `backend/src/worker.ts` to invoke `cron.ts` with the Worker env + D1 binding

#### API routes (US1 scope)

- [ ] T057 [P] [US1] Implement `GET /api/snapshots/latest` at `backend/src/routes/snapshots.ts` reading via `storage/snapshots.ts#getLatest`, returning 204 on empty DB
- [ ] T058 [P] [US1] Implement `GET /api/sources` at `backend/src/routes/sources.ts` reading `source_metadata` via a new `storage/sources.ts#listSources`

#### Frontend — Dashboard page

- [ ] T059 [P] [US1] Implement `<CompositeHeatmap>` at `frontend/src/components/CompositeHeatmap.tsx` — 5-cell red-to-green gradient bar using `tokens.css` variables, numeric + label + aria-label per ui-contract.md
- [ ] T060 [P] [US1] Implement `<FlagRow>` at `frontend/src/components/FlagRow.tsx` — single row with source name, rule, raw value, state icon, points
- [ ] T061 [P] [US1] Implement `<ScoringBreakdown>` at `frontend/src/components/ScoringBreakdown.tsx` — fixed-order list of four `<FlagRow>`s using data from `getSources()` + `getLatest()`
- [ ] T062 [US1] Implement Dashboard page at `frontend/src/pages/Dashboard.tsx` — composes `<CompositeHeatmap>` + `<ScoringBreakdown>` + timestamp + `<EmptyState>` on 204; uses TanStack Query `useQuery(['latest'], getLatest)`
- [ ] T063 [US1] Wire Dashboard into `frontend/src/App.tsx` `/` route

**Checkpoint**: MVP shippable. User can view the current composite score + per-flag breakdown on the dashboard. Cron must still be triggered manually (automated refresh lands in US2).

---

## Phase 4: User Story 2 — Automatic refresh and durable history (Priority: P2)

**Goal**: Cron fires automatically every 30 min at `:00`/`:30` UTC; each cycle persists a snapshot; open dashboard reflects new snapshots without reload; partial/no-data statuses handled correctly.

**Independent Test**: Deploy to Cloudflare preview; leave `/` open across a slot boundary; within 60 s of the new slot passing, the displayed snapshot's `slot_ts` is the new slot. Count `SELECT COUNT(*) FROM snapshots WHERE slot_ts >= X` matches elapsed slots ± 1.

### Tests for User Story 2 ⚠️

- [ ] T064 [P] [US2] Unit test for slot rounding at `backend/tests/unit/slot.test.ts` covering minute 0, 29, 30, 59 and DST edges (UTC is DST-free but assert non-UTC inputs are normalised)
- [ ] T065 [P] [US2] Integration test for dedup behaviour at `backend/tests/integration/cron-dedup.test.ts` — fire the scheduled handler twice for the same slot; assert exactly one `snapshots` row
- [ ] T066 [P] [US2] Integration test for partial composite at `backend/tests/integration/cron-partial.test.ts` — fail the CNN F&G fetcher; assert snapshot persisted with `status='partial'`, `failed_sources='cnn_fg'`, composite ≤ 75
- [ ] T067 [P] [US2] Integration test for no-data cycle at `backend/tests/integration/cron-no-data.test.ts` — fail all 4 fetchers; assert snapshot persisted with `status='no-data'`, `composite_score=NULL`
- [ ] T068 [P] [US2] E2E test at `frontend/tests/e2e/auto-refresh.spec.ts` — seed a snapshot at slot T; open dashboard; inject a new snapshot at slot T+30; assert UI updates within 65 s without reload

### Implementation for User Story 2

- [ ] T069 [US2] Refine cron handler at `backend/src/cron.ts` to: tolerate per-fetcher failures via `Promise.allSettled` results (do not throw on partial failure), compute correct `status` across all three cases (complete/partial/no-data), populate `failed_sources`, set `fetch_error` on failed readings
- [ ] T070 [P] [US2] Add Workers Analytics Engine observability at `backend/src/lib/metrics.ts` exporting `recordFetchSuccess`, `recordFetchFailure`, `recordFetchDuration`, `recordCycleStatus`; wire calls from `cron.ts`
- [ ] T071 [P] [US2] Add retry-safe slot-key dedup: update `storage/snapshots.ts#insertSnapshot` to use `ON CONFLICT(slot_ts) DO NOTHING` and return `{ inserted: boolean }`; cron handler logs but does not retry on conflict
- [ ] T072 [P] [US2] Implement `<StaleBadge>` visibility logic in `frontend/src/components/StaleBadge.tsx` — shows when `fetched_at` is > 90 min old (one missed cycle + current)
- [ ] T073 [P] [US2] Implement `<PartialBadge>` at `frontend/src/components/PartialBadge.tsx` — renders "Partial — n of 4 sources reporting" with list of failed sources
- [ ] T074 [US2] Wire badges into Dashboard at `frontend/src/pages/Dashboard.tsx` — show `<StaleBadge>` as banner when stale; show `<PartialBadge>` next to heatmap when `status=partial`; "no-data" state shows previous composite with explicit "last successful at" copy
- [ ] T075 [US2] Configure TanStack Query polling at `frontend/src/pages/Dashboard.tsx` — `refetchInterval: 60_000`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`
- [ ] T076 [US2] Enable `[triggers] crons = ["0,30 * * * *"]` in `backend/wrangler.toml` and document the manual-trigger alternative in `backend/README.md`

**Checkpoint**: System runs autonomously. Every 30 min a snapshot is captured; the dashboard refreshes itself; partial and no-data cycles are handled explicitly.

---

## Phase 5: User Story 3 — Review historical trend (Priority: P3)

**Goal**: User selects a time range (24 h / 7 d / 30 d / all) and sees a time-series chart of the composite + per-source values, with gaps rendered for `no-data` slots. S&P 500 intraday candles rendered on the same page.

**Independent Test**: With at least 7 days of persisted snapshots, open `/history`, select "7 days"; assert chart renders in < 3 s showing composite + 4 source lines, with broken-line segments at `no-data` points; candle chart shows the last 5 trading days of 30-min S&P 500 bars.

### Tests for User Story 3 ⚠️

- [ ] T077 [P] [US3] Unit test for resolution auto-picker at `backend/tests/unit/storage/resolution.test.ts` — asserts `pickResolution(from,to)` returns `raw` for ≤7 d, `2h` for 7–30 d, `1d` for >30 d
- [ ] T078 [P] [US3] Unit test for SQL aggregation at `backend/tests/unit/storage/aggregate.test.ts` — against in-memory sqlite, insert 50 snapshots over 7 days, run raw / 2h / 1d queries, assert bucket counts and averages
- [ ] T079 [P] [US3] Integration test for `/api/snapshots?from&to&resolution` at `backend/tests/integration/snapshots-range.api.test.ts` — seeds 30 days of snapshots; asserts shape and point count for each of `raw`, `2h`, `1d`, and auto; asserts 400 on invalid range (`to <= from`, range > 5 years)
- [ ] T080 [P] [US3] Integration test for `/api/sources/{sourceId}` at `backend/tests/integration/source-range.api.test.ts` — per-source history for each of the four source ids
- [ ] T081 [P] [US3] Component test for `<HistoryChart>` at `frontend/tests/unit/HistoryChart.test.tsx` — renders step-line composite + toggleable source lines, broken lines at `no-data` points (per ui-contract.md)
- [ ] T082 [P] [US3] Component test for `<Sp500CandleChart>` at `frontend/tests/unit/Sp500CandleChart.test.tsx` — renders candle series, responds to range changes, has `role="img"` + aria-label
- [ ] T083 [P] [US3] E2E test at `frontend/tests/e2e/history.spec.ts` — selects "7 days", asserts chart + candle panel render within 3 s, zero axe violations, broken-line gap visible at seeded `no-data` slot

### Implementation for User Story 3

#### Backend

- [ ] T084 [P] [US3] Implement resolution picker + range validator at `backend/src/storage/resolution.ts` exporting `pickResolution(from, to): 'raw'|'2h'|'1d'` and `validateRange(from, to)` (throws on invalid)
- [ ] T085 [P] [US3] Implement historical query at `backend/src/storage/snapshots.ts#listSnapshots(db, {from, to, resolution})` with three SQL branches (raw / 2h bucket via `strftime` / 1d bucket via `date()`)
- [ ] T086 [P] [US3] Implement per-source query at `backend/src/storage/snapshots.ts#listSourceReadings(db, {sourceId, from, to, resolution})` joined to `source_readings`
- [ ] T087 [US3] Implement `GET /api/snapshots` at `backend/src/routes/snapshots.ts` — parses & validates `from`, `to`, optional `resolution` via Zod; returns 400 with `Error` schema on invalid input
- [ ] T088 [US3] Implement `GET /api/sources/:sourceId` at `backend/src/routes/sources.ts`

#### Frontend

- [ ] T089 [P] [US3] Implement `<RangeSelector>` at `frontend/src/components/RangeSelector.tsx` — tab-style control for {24 h, 7 d, 30 d, all time, custom}; emits `{from, to}`
- [ ] T090 [P] [US3] Implement `<HistoryChart>` at `frontend/src/components/HistoryChart.tsx` using Recharts `LineChart` with step-line shape for composite; toggleable source lines; `role="img"` + descriptive aria-label
- [ ] T091 [P] [US3] Implement `<Sp500CandleChart>` at `frontend/src/components/Sp500CandleChart.tsx` using `lightweight-charts` — 30-min intraday bars, resizes on container change
- [ ] T092 [US3] Implement History page at `frontend/src/pages/History.tsx` — composes `<RangeSelector>` + `<HistoryChart>` + `<Sp500CandleChart>` + appropriate loading/empty/error states per ui-contract.md
- [ ] T093 [US3] Wire History into `frontend/src/App.tsx` `/history` route; add top-level nav link from Dashboard
- [ ] T094 [US3] Add "showing {resolution} averages" caption in `frontend/src/components/HistoryChart.tsx` rendered beneath the chart whenever the backend returns `resolution !== 'raw'`

**Checkpoint**: All three user stories are independently functional. Historical data can be reviewed across arbitrary ranges with appropriate down-sampling.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Constitution-compliance gates and deployment readiness.

- [ ] T095 [P] Add Lighthouse CI config at `frontend/lighthouserc.json` with per-route budgets from ui-contract.md (Dashboard TTI ≤ 2.5 s / JS ≤ 100 KB gz; History TTI ≤ 2.5 s / JS ≤ 150 KB gz); wire into `.github/workflows/ci.yml`
- [ ] T096 [P] Add bundle-size tracking via bundlewatch at `frontend/bundlewatch.config.json` with per-chunk thresholds; fail CI on > 10% regression (Constitution Principle IV)
- [ ] T097 [P] Add axe-core accessibility sweep to every Playwright test via `frontend/tests/e2e/a11y.ts` helper; fail on any `serious`/`critical` violation (Constitution Principle III)
- [ ] T098 [P] Add no-hard-coded-JSX-text lint rule at `.eslintrc.cjs` forbidding string literals in `frontend/src/components/**` — all copy must come from `copy.ts`
- [ ] T099 [P] Add coverage gate at `.github/workflows/ci.yml` requiring ≥ 80% line + branch coverage across backend + frontend unit suites (Constitution Principle II)
- [ ] T100 [P] Create deploy workflow at `.github/workflows/deploy.yml` — on merge to main: `wrangler d1 migrations apply`, `wrangler deploy` (backend), `wrangler pages deploy frontend/dist` (frontend)
- [ ] T101 [P] Add repo `README.md` with deploy instructions (sourced from `quickstart.md`), screenshots of the dashboard, and a link to `specs/001-market-sentiment-score/`
- [ ] T102 Add performance verification test at `backend/tests/integration/query-perf.test.ts` — seeds 30 days of snapshots, asserts `/api/snapshots?resolution=2h&range=30d` returns in < 300 ms p95 locally
- [ ] T103 Run full quickstart.md verification end-to-end against a preview deploy and tick off SC-001..SC-007 in a checklist comment on the PR
- [ ] T104 Sanity-check the Constitution Check table in `plan.md` against the final implementation — any violations discovered now MUST be recorded in the `Complexity Tracking` table before merge

---

## Dependencies & Execution Order

### Phase-level dependencies

- **Phase 1 (Setup)** → no dependencies; start immediately
- **Phase 2 (Foundational)** → depends on Phase 1; **blocks all user stories**
- **Phase 3 (US1 / MVP)** → depends on Phase 2
- **Phase 4 (US2)** → depends on Phase 3 (reuses fetchers + persistence + UI shell)
- **Phase 5 (US3)** → depends on Phase 4 (needs persisted history to chart)
- **Phase 6 (Polish)** → depends on all desired user stories being complete

### User-story dependencies

- **US1 (P1)**: needs the Worker + D1 + frontend shell from Phase 2 only. Can ship standalone with manual cron-trigger as the MVP.
- **US2 (P2)**: structurally depends on US1 (reuses every fetcher, scoring module, snapshot writer, and UI component). Extends them with automated scheduling + observability + partial/stale UX.
- **US3 (P3)**: structurally depends on US2 (needs a backlog of snapshots to render; also reuses the snapshot reader pattern). Adds range queries + charts.

### Within each user story

- Tests MUST be written and failing before implementation (Constitution Principle II).
- Inside the backend: fetchers → scoring → storage writer → cron → API routes.
- Inside the frontend: leaf components → composite components → page → route wiring.

### Parallel opportunities

- All Phase 1 tasks with `[P]` run concurrently (`T002..T004, T007..T010`).
- In Phase 2, T015–T019 (helper libraries) all parallel; T024–T026, T029–T032 (frontend shell + test harness) parallel.
- Phase 3: every `[P]` test task (T033..T045) runs concurrently; once tests fail, all `[P]` fetcher implementations (T046..T050) run concurrently; frontend leaf components (T059–T061) run concurrently.
- Phases can overlap across developers once Phase 2 is done — US1 and US3 touch different files, so parallel stream A (US1 core) + stream B (US3 range-query SQL scaffolding) is feasible.

---

## Parallel Example: User Story 1 bootstrap

```bash
# Step 1 — write failing tests (all parallel; different files)
Task: "Unit test for VIX parser in backend/tests/unit/fetchers/vix.test.ts"
Task: "Unit test for CNN F&G parser in backend/tests/unit/fetchers/cnn-fg.test.ts"
Task: "Unit test for S&P 500 daily parser in backend/tests/unit/fetchers/sp500-daily.test.ts"
Task: "Unit test for S5FI parser in backend/tests/unit/fetchers/s5fi.test.ts"
Task: "Unit test for scoring flags in backend/tests/unit/scoring/flags.test.ts"
Task: "Unit test for composite computation in backend/tests/unit/scoring/composite.test.ts"

# Step 2 — implement fetchers (all parallel; different files)
Task: "Implement VIX fetcher in backend/src/fetchers/vix.ts"
Task: "Implement CNN F&G fetcher in backend/src/fetchers/cnn-fg.ts"
Task: "Implement S&P 500 daily fetcher in backend/src/fetchers/sp500-daily.ts"
Task: "Implement S&P 500 intraday fetcher in backend/src/fetchers/sp500-intraday.ts"
Task: "Implement S5FI fetcher in backend/src/fetchers/s5fi.ts"

# Step 3 — scoring + storage (sequential; shared surfaces)
Task: "Implement flag rules in backend/src/scoring/flags.ts"
Task: "Implement composite computation in backend/src/scoring/composite.ts"
Task: "Implement snapshot writer in backend/src/storage/snapshots.ts"

# Step 4 — cron + API + frontend wiring
Task: "Implement cron handler in backend/src/cron.ts"
Task: "Implement GET /api/snapshots/latest in backend/src/routes/snapshots.ts"
Task: "Implement GET /api/sources in backend/src/routes/sources.ts"
Task: "Implement <CompositeHeatmap> in frontend/src/components/CompositeHeatmap.tsx"
Task: "Implement <FlagRow> in frontend/src/components/FlagRow.tsx"
Task: "Implement <ScoringBreakdown> in frontend/src/components/ScoringBreakdown.tsx"
Task: "Implement Dashboard page in frontend/src/pages/Dashboard.tsx"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: Setup (T001–T010)
2. Phase 2: Foundational (T011–T032) — DB, Worker, frontend shell
3. Phase 3: US1 (T033–T063) — **this is shippable**
4. **STOP and validate**: confirm the composite renders correctly with a manually-triggered cron
5. Demo / collect feedback before committing to automated cycles

### Incremental delivery

1. Ship MVP (US1) to production; manually trigger cron from the Cloudflare dashboard for a few days; watch real upstream behaviour.
2. Add US2 (T064–T076): automated scheduling + partial-cycle UX — fully autonomous operation.
3. After ≥ 7 days of accumulated snapshots, add US3 (T077–T094): history view and candle chart.
4. Polish (T095–T104) in parallel with US3 where it doesn't block.

### Parallel team strategy (if multiple developers)

After Phase 2 completes:
- Developer A: US1 backend (fetchers / scoring / storage / cron / API)
- Developer B: US1 frontend (components / page / tests)
- Developer C: US3 scaffolding (resolution picker + historical SQL branches) — safe to start since file surfaces don't overlap US1
Once US1 lands, Developers A & B reconverge on US2 wiring, and Developer C's US3 work slots in.

---

## Notes

- `[P]` tasks touch different files and have no ordering dependency.
- `[US#]` labels map every task to its user story for traceability.
- Each user story is independently testable — stop at any checkpoint to validate and deploy.
- Every implementation task MUST have its paired test failing first (Constitution Principle II — NON-NEGOTIABLE).
- Commit after each logical group (e.g., "US1 fetchers + their tests", not one giant blob).
- Avoid: vague tasks, same-file conflicts between `[P]` tasks, cross-story coupling that breaks independence.
