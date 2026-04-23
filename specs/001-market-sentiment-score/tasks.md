---
description: "Task list for Market Sentiment Score Dashboard — MVP-scoped (US1 only); US2 and US3 deferred."
---

# Tasks: Market Sentiment Score Dashboard

**Input**: Design documents from `/specs/001-market-sentiment-score/`
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [contracts/ui-contract.md](./contracts/ui-contract.md), [quickstart.md](./quickstart.md)

**Tests**: Required. Constitution Principle II (NON-NEGOTIABLE) mandates a failing test before any implementation.

**Scope reminder**: MVP = Phase 1 + Phase 2 + Phase 3 (US1). Phases 4 and 5 (US2, US3) are captured for completeness but **deferred post-MVP** per the Implementation Status table in [spec.md](./spec.md). Phase 6 (Polish) runs after whichever user stories have landed.

**Working-tree drift note**: the repo currently contains `scripts/cron/` + `.github/workflows/cron.yml` + `backend/src/routes/ingest.ts` from the prior (GH-Actions-scheduled) plan. Phase 1 cleans these up; Phase 3 lands their replacements.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3). Setup/Foundational/Polish have no story label.
- Paths are absolute-in-repo (relative to repo root).

## Path Conventions

Three-workspace pnpm monorepo per the refreshed plan:

- **Backend Worker**: `backend/src/`, `backend/tests/`
- **Frontend SPA**: `frontend/src/`, `frontend/tests/`
- **TradingView sidecar** (Vercel Node fn): `scripts/tradingview-sidecar/src/`, `scripts/tradingview-sidecar/api/`, `scripts/tradingview-sidecar/tests/`

---

## Phase 1: Setup & Pre-Pivot Cleanup (Shared Infrastructure)

**Purpose**: Remove dead code from the prior plan iteration and align the workspace layout with the refreshed plan.

- [ ] T001 [P] Delete `.github/workflows/cron.yml` (old GH Actions cron workflow; MVP has no scheduled trigger)
- [ ] T002 [P] Delete `backend/src/routes/ingest.ts` (old push-ingest endpoint; will be replaced by `refresh.ts` in US1)
- [ ] T003 Rename workspace `scripts/cron/` → `scripts/tradingview-sidecar/` via `git mv` (preserves history)
- [ ] T004 [P] Delete `scripts/tradingview-sidecar/src/run.ts` (orchestration moves into the Worker in US1)
- [ ] T005 [P] Delete `scripts/tradingview-sidecar/src/post.ts` (sidecar no longer POSTs to the Worker; the Worker calls the sidecar)
- [ ] T006 [P] Delete `scripts/tradingview-sidecar/src/scoring.ts` (scoring stays canonical in `backend/src/scoring/`)
- [ ] T007 [P] Delete `scripts/tradingview-sidecar/src/slot.ts` (slot rounding stays canonical in `backend/src/lib/slot.ts`)
- [ ] T008 [P] Delete `scripts/tradingview-sidecar/src/fetchers/cnn-fg.ts` (CNN F&G moves to Worker in US1; sidecar is TradingView-only)
- [ ] T009 [P] Update `scripts/tradingview-sidecar/package.json` — rename `name` to `@market-sentiment/tradingview-sidecar`; keep `@mathieuc/tradingview` + `typescript` + `tsx` + `vitest`; drop backend-only devDeps (`zod`, `@types/node` unless Vercel build needs it)
- [ ] T010 [P] Update root `pnpm-workspace.yaml` if the directory rename changes any glob (verify `scripts/tradingview-sidecar` is matched)
- [ ] T011 [P] Update root `package.json` filter scripts — replace any `@market-sentiment/cron` reference with `@market-sentiment/tradingview-sidecar`

**Checkpoint**: Working tree is clean of pre-pivot artifacts; the three workspaces (`backend/`, `frontend/`, `scripts/tradingview-sidecar/`) are in place but not yet re-wired.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that every user story depends on — schemas, types, config, test harness.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

### Backend — storage + types + config

- [ ] T012 [P] Verify D1 schema in `backend/src/storage/schema.ts` matches [data-model.md](./data-model.md) (snapshots / source_readings / source_metadata tables + indexes)
- [ ] T013 [P] Verify `backend/src/storage/migrations/0001_init.sql` creates all three tables + indexes with CHECK constraints
- [ ] T014 [P] Verify `backend/src/storage/migrations/0002_seed_sources.sql` seeds the four rows in `source_metadata` with names, descriptions, flag rules, cadence
- [ ] T015 [P] Update `backend/src/env.ts` — `Env` interface MUST include `DB: D1Database` + `TRADINGVIEW_SIDECAR_URL: string` + optional threshold vars (`VIX_THRESHOLD`, `FG_THRESHOLD`, `S5FI_THRESHOLD`, `SP500_RED_DAYS_MIN`); MUST NOT include `CRON_SECRET`
- [ ] T016 [P] Update `backend/wrangler.toml` — D1 binding, vars block with thresholds, remove cron trigger stub, document `TRADINGVIEW_SIDECAR_URL` is set via `wrangler secret put`
- [ ] T017 [P] Verify `backend/src/fetchers/types.ts` exports `SourceId`, `FetchStatus`, `FetchResult<T>`
- [ ] T018 [P] Verify `backend/src/lib/slot.ts` provides `roundToSlot(date)` + `currentSlot()` returning clock-aligned `:00` / `:30` UTC ISO strings
- [ ] T019 [P] Verify `backend/src/lib/time.ts` (ISO helpers) and `backend/src/lib/errors.ts` (fetch failure taxonomy)
- [ ] T020 [P] Verify `backend/src/config.ts` — Zod-parsed `ScoringConfig` from env vars with defaults from FR-005 / FR-006
- [ ] T021 [P] Verify `backend/src/storage/client.ts` exports `createDb(d1)` returning typed Drizzle DB
- [ ] T022 [P] Verify `backend/src/storage/snapshots.ts` exports `insertSnapshot` (idempotent via `onConflictDoNothing`), `getLatestSnapshot`, `getReadingsForSlot`, `getSnapshotsBetween`, `getSourceSeries`
- [ ] T023 [P] Verify `backend/src/storage/sources.ts` exports `listSources`
- [ ] T024 [P] Verify `backend/vitest.config.ts` wires Vitest + Miniflare 3 + local D1 SQLite for integration tests

### Sidecar — tooling baseline

- [ ] T025 [P] Create `scripts/tradingview-sidecar/tsconfig.json` (extends `../../tsconfig.base.json`, Node 20 libs, `rootDir: src`, include `src/**/*.ts` + `api/**/*.ts`)
- [ ] T026 [P] Create `scripts/tradingview-sidecar/vercel.json` — pin Node 20 runtime, function region (`iad1` or `cdg1`), output from `api/**/*.ts`
- [ ] T027 [P] Create `scripts/tradingview-sidecar/vitest.config.ts` — unit + integration suites, coverage threshold ≥ 80%
- [ ] T028 [P] Create `scripts/tradingview-sidecar/.gitignore` — exclude `.vercel/`, `dist/`, `node_modules/`

### Frontend — tooling baseline

- [ ] T029 [P] Verify `frontend/package.json` lists React 18, Vite 5, TanStack Query 5, Vitest, Testing Library
- [ ] T030 [P] Verify `frontend/vite.config.ts` (base, env handling for `VITE_API_BASE_URL`)
- [ ] T031 [P] Verify `frontend/tsconfig.json` strict mode on, React + Vite types
- [ ] T032 [P] Verify `frontend/index.html` shell + `frontend/src/main.tsx` root
- [ ] T033 [P] Verify `frontend/src/test-setup.ts` (Testing Library + jsdom)
- [ ] T034 [P] Verify `frontend/src/styles/tokens.css` (design tokens per Principle III) + `frontend/src/styles/global.css`
- [ ] T035 [P] Verify ESLint rule in `.eslintrc.cjs` (or equivalent) forbids hard-coded `JSXText` inside `frontend/src/components/**` (all strings must come from `copy.ts`)

### CI

- [ ] T036 [P] Verify `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test:unit`, `pnpm -r test:integration`, and `pnpm -r build`

**Checkpoint**: All three workspaces typecheck and CI is green on an empty-feature state. Ready to implement User Story 1.

---

## Phase 3: User Story 1 — See the current buy/sell score at a glance (Priority: P1) 🎯 MVP

**Goal**: A publicly-accessible dashboard that, when the user clicks Refresh (or on first-ever visit auto-triggers one refresh), fetches all four sources, scores them into a composite in `{0, 25, 50, 75, 100}`, and renders a red-to-green heatmap plus a per-flag breakdown.

**Independent Test**: open the deployed dashboard in a browser (empty D1 → auto-refresh fires once → first snapshot appears). Click Refresh → UI shows busy state, returns an updated snapshot or the same one if same slot. Manually break one source (rename a TradingView symbol in the sidecar) → next refresh returns a partial composite with the failed source marked "not evaluated". Every acceptance scenario AS1.1–AS1.5 is observable. SC-001, SC-003 (reinterpreted), SC-005 (reinterpreted), SC-007 must hold.

### Tests for User Story 1 (write first; each MUST fail before implementation)

#### Backend

- [ ] T037 [P] [US1] Unit tests for `backend/src/lib/slot.ts` — `roundToSlot` rounds `:15` → `:00`, `:45` → `:30`, `:30:00` → `:30:00`, `:00:00` → `:00:00`; in `backend/tests/unit/slot.test.ts`
- [ ] T038 [P] [US1] Unit tests for `backend/src/scoring/flags.ts` — `evaluateVix` / `evaluateFg` / `evaluateS5fi` boundary cases (equal, just-above, just-below, NaN); in `backend/tests/unit/flags.test.ts`
- [ ] T039 [P] [US1] Unit tests for red-day tail-streak logic: inputs with streaks of 0 / 1 / 2 / 3 / 4 / 5 consecutive red closes; in-progress bar filtered; mixed red/green sequences; in `backend/tests/unit/red-streak.test.ts`
- [ ] T040 [P] [US1] Unit tests for `backend/src/scoring/composite.ts` — `computeComposite` produces correct status/score for 0 / 1 / 2 / 3 / 4 ok sources; `no-data` iff all failed (FR-012); in `backend/tests/unit/composite.test.ts`
- [ ] T041 [P] [US1] Unit tests for CNN F&G JSON parser — shape OK, shape drift, missing `fear_and_greed.score`; in `backend/tests/unit/cnn-fg.parser.test.ts`
- [ ] T042 [P] [US1] Unit tests for sidecar response parser — ok payload, partial (one source missing), sidecar 5xx; in `backend/tests/unit/sidecar.parser.test.ts`
- [ ] T043 [P] [US1] Integration test — `POST /api/snapshots/refresh` end-to-end with Miniflare + local D1 + `fetch()` mocked for CNN + `fetch()` mocked for sidecar. Asserts: 201 on first call, `snapshots` + `source_readings` rows persisted, composite is one of `{0,25,50,75,100}`, response body matches the Snapshot schema in `contracts/openapi.yaml`; in `backend/tests/integration/refresh.test.ts`
- [ ] T044 [P] [US1] Integration test — `/refresh` idempotency: two calls within the same 30-min slot. Second returns HTTP 200, `inserted: false`, with the same `slot_ts`; `SELECT COUNT(*) FROM snapshots` = 1; in `backend/tests/integration/idempotent.test.ts`
- [ ] T045 [P] [US1] Integration test — `/refresh` with CNN failing: returns 201 with `status: partial`, `failed_sources: ['cnn_fg']`, composite bounded above by 75; in `backend/tests/integration/partial.test.ts`
- [ ] T046 [P] [US1] Integration test — `/refresh` with sidecar unreachable (HTTP 502): returns 201 with `status: partial` (three sources failed), or HTTP 502 with `status: no-data` row persisted when CNN also fails; in `backend/tests/integration/sidecar-down.test.ts`
- [ ] T047 [P] [US1] Integration test — read endpoints (`GET /api/health`, `/api/sources`, `/api/sources/:id`, `/api/snapshots`, `/api/snapshots/latest`) against seeded D1; schema conforms to `contracts/openapi.yaml`; in `backend/tests/integration/read.test.ts`

#### Sidecar

- [ ] T048 [P] [US1] Sidecar unit test — TradingView WebSocket wrapper: quote session completes on first `qsd` frame and times out after N ms; mocked `WebSocket`; in `scripts/tradingview-sidecar/tests/unit/tradingview.test.ts`
- [ ] T049 [P] [US1] Sidecar unit test — VIX fetcher happy path + TV symbol-not-found error; in `scripts/tradingview-sidecar/tests/unit/vix.test.ts`
- [ ] T050 [P] [US1] Sidecar unit test — S&P 500 daily fetcher returns only completed bars (filters out the current-day in-progress bar); in `scripts/tradingview-sidecar/tests/unit/sp500-daily.test.ts`
- [ ] T051 [P] [US1] Sidecar unit test — S5FI fetcher clamps raw value to `[0, 100]`; in `scripts/tradingview-sidecar/tests/unit/s5fi.test.ts`
- [ ] T052 [P] [US1] Sidecar integration test — `POST /fetch` returns combined payload `{vix, sp500, s5fi}`; with one fetcher stubbed to fail, returns 200 with that key omitted; in `scripts/tradingview-sidecar/tests/integration/fetch.test.ts`

#### Frontend

- [ ] T053 [P] [US1] Component test — `<CompositeHeatmap>` renders correct color stop for each of `{0, 25, 50, 75, 100}`; `status=no-data` renders grey + em-dash; aria-label present; in `frontend/tests/unit/CompositeHeatmap.test.tsx`
- [ ] T054 [P] [US1] Component test — `<ScoringBreakdown>` renders 4 `<FlagRow>`s, each with source name / rule / raw value / ✓-✗ / points; failed source renders the failure state (distinct from ✗) per FR-017; in `frontend/tests/unit/ScoringBreakdown.test.tsx`
- [ ] T055 [P] [US1] Component test — `<PartialBadge>` lists the failed source names and exposes correct aria-label; in `frontend/tests/unit/PartialBadge.test.tsx`
- [ ] T056 [P] [US1] Component test — `<RefreshButton>` enters a busy/disabled state while `/refresh` is in flight, calls the API client once per click, invalidates the `latest` query on success, surfaces error on failure (FR-018, AS1.4); in `frontend/tests/unit/RefreshButton.test.tsx`
- [ ] T057 [P] [US1] Component test — `<LastRefreshed>` formats "Last refreshed: N ago" and re-renders at least once per minute (FR-014); in `frontend/tests/unit/LastRefreshed.test.tsx`
- [ ] T058 [P] [US1] Page test — `<Dashboard>` first-visit auto-trigger: when `GET /api/snapshots/latest` returns 204 (empty DB), the page auto-invokes `/refresh` exactly once and renders the returned snapshot; when the API returns a snapshot, the page does NOT auto-invoke `/refresh` (AS1.5); in `frontend/tests/unit/Dashboard.autotrigger.test.tsx`
- [ ] T059 [P] [US1] Page test — `<Dashboard>` empty / loading / error / success (complete/partial/no-data) states each render per [`contracts/ui-contract.md`](./contracts/ui-contract.md); axe-core reports zero accessibility violations; in `frontend/tests/unit/Dashboard.states.test.tsx`

### Implementation for User Story 1

#### Sidecar

- [ ] T060 [P] [US1] TradingView WebSocket promise wrapper — `getQuote(symbol)` and `getCandles(symbol, timeframe, limit)` with timeout + cleanup; in `scripts/tradingview-sidecar/src/tradingview.ts`
- [ ] T061 [P] [US1] VIX fetcher — `getQuote('CBOE:VIX')` returning `{ raw, fetched_at }`; in `scripts/tradingview-sidecar/src/fetchers/vix.ts`
- [ ] T062 [P] [US1] S&P 500 daily fetcher — `getCandles('CBOE:SPX', 'D', 10)` returning `{ closes, latest_date, fetched_at }` with the in-progress bar filtered; in `scripts/tradingview-sidecar/src/fetchers/sp500-daily.ts`
- [ ] T063 [P] [US1] S5FI fetcher — `getQuote('INDEX:S5FI')` returning `{ raw, fetched_at }` with value clamped to `[0, 100]`; in `scripts/tradingview-sidecar/src/fetchers/s5fi.ts`
- [ ] T064 [US1] Vercel handler — `POST /fetch` fans out to the three fetchers in parallel, returns a combined payload; per-source failures omit the key instead of 5xx-ing; HTTP 502 only on full failure; in `scripts/tradingview-sidecar/api/fetch.ts` (depends on T060–T063)

#### Backend fetchers

- [ ] T065 [P] [US1] CNN F&G fetcher — HTTPS GET `https://production.dataviz.cnn.io/index/fearandgreed/graphdata` with `User-Agent: Mozilla/5.0` and `Accept: application/json`; extract `json.fear_and_greed.score`; map to `FetchResult<CnnFgPayload>`; in `backend/src/fetchers/cnn-fg.ts`
- [ ] T066 [P] [US1] Sidecar fetcher — HTTPS POST to `${TRADINGVIEW_SIDECAR_URL}/fetch` with 10 s timeout; parse combined payload; map per-source absence to `FetchResult<_>` with `fetch-failed`; map HTTP non-2xx to all-three-failed; in `backend/src/fetchers/sidecar.ts`

#### Backend orchestrator + routes

- [ ] T067 [US1] Orchestrator — in parallel: CNN fetcher + sidecar fetcher. On return, evaluate the four flags, compute composite per FR-005 / FR-012, build the Snapshot row-set, call `insertSnapshot`; return `{snapshot, inserted}`; in `backend/src/orchestrator.ts` (depends on T040, T065, T066)
- [ ] T068 [US1] Refresh route — `POST /api/snapshots/refresh`: no request body; invokes the orchestrator; returns 201 + Snapshot on insert, 200 + `{slot_ts, inserted:false, snapshot}` on same-slot, 502 + Error when `status=no-data` (both CNN and sidecar failed). Unauthenticated. Conforms to `contracts/openapi.yaml`; in `backend/src/routes/refresh.ts` (depends on T067)
- [ ] T069 [P] [US1] Health route — `GET /api/health` returns `{status, last_cycle_at, last_cycle_status}` per Health schema in `contracts/openapi.yaml` (on-demand reinterpretation: `ok` if most recent snapshot is complete/partial, `degraded` if no-data or no snapshot); in `backend/src/routes/health.ts`
- [ ] T070 [P] [US1] Sources routes — `GET /api/sources` returns seeded metadata; `GET /api/sources/:sourceId` returns historical readings with `from`/`to`/`resolution` query params (historical portion mostly exercised by US3; basic range query for MVP); in `backend/src/routes/sources.ts`
- [ ] T071 [P] [US1] Snapshots read routes — `GET /api/snapshots/latest` (200 or 204), `GET /api/snapshots` with `from`/`to`/`resolution` (raw for MVP); in `backend/src/routes/snapshots.ts`
- [ ] T072 [US1] Hono router assembly in `backend/src/router.ts` — mounts refresh / health / sources / snapshots; global CORS (allow the Pages origin + `localhost:5173`); (depends on T068–T071)
- [ ] T073 [US1] Worker entry in `backend/src/worker.ts` — `export default { fetch: app.fetch }`; **no** `scheduled` handler (comment: "MVP is on-demand per FR-018; US2 re-lands the scheduled handler"); (depends on T072)

#### Frontend — lib + copy

- [ ] T074 [P] [US1] API types mirroring `contracts/openapi.yaml` — `Snapshot`, `SourceReading`, `SourceMetadata`, `Health`, error shape; in `frontend/src/lib/api-types.ts`
- [ ] T075 [P] [US1] Typed API client — `getLatest()`, `listSources()`, `getHealth()`, `refresh()`; base URL from `VITE_API_BASE_URL`; throws on non-2xx; in `frontend/src/lib/api.ts`
- [ ] T076 [P] [US1] Heatmap color-stops + label mapping `{0: 'Strong sell/caution', 25: 'Lean sell', 50: 'Neutral', 75: 'Lean buy', 100: 'Strong buy'}` (labels track `tokens.css` colour stops); in `frontend/src/lib/heatmap.ts`
- [ ] T077 [P] [US1] Relative-time formatter — `formatRelative(iso)` returns strings like `"3 m ago"`, `"2 h ago"`; used by `<LastRefreshed>`; in `frontend/src/lib/relative-time.ts`
- [ ] T078 [P] [US1] UI copy — every user-visible string routed through `frontend/src/lib/copy.ts` (Principle III + ESLint rule): dashboard headings, flag rows (name + rule + points label + not-evaluated copy), partial badge copy, empty / error / first-visit-loading states, refresh-button labels (idle/busy/success/error), relative-time helper

#### Frontend — components

- [ ] T079 [P] [US1] `<CompositeHeatmap>` — renders numeric score + text label + color bar; handles null composite for `no-data`; ARIA-labelled; in `frontend/src/components/CompositeHeatmap.tsx`
- [ ] T080 [P] [US1] `<FlagRow>` — one row: source name, rule text, raw value, ✓/✗/"not evaluated", points contribution; in `frontend/src/components/FlagRow.tsx`
- [ ] T081 [P] [US1] `<ScoringBreakdown>` — renders the four `<FlagRow>`s in a stable order; in `frontend/src/components/ScoringBreakdown.tsx` (depends on T080)
- [ ] T082 [P] [US1] `<PartialBadge>` — renders when `snapshot.status !== 'complete'`; aria-label names the failed sources; in `frontend/src/components/PartialBadge.tsx`
- [ ] T083 [P] [US1] `<EmptyState>` — rendered when `/api/snapshots/latest` returns 204 and the first-visit auto-trigger is in flight or pre-triggered; in `frontend/src/components/EmptyState.tsx`
- [ ] T084 [P] [US1] `<ErrorState>` — rendered on API 5xx or network failure; has a retry button; in `frontend/src/components/ErrorState.tsx`
- [ ] T085 [P] [US1] `<RefreshButton>` — calls `api.refresh()`, enters busy/disabled state while pending, invalidates the TanStack `latest` query on success, surfaces error on failure; in `frontend/src/components/RefreshButton.tsx`
- [ ] T086 [P] [US1] `<LastRefreshed>` — reads `fetched_at` off the current snapshot; formats via `relative-time.ts`; re-renders every 30 s via an interval effect; in `frontend/src/components/LastRefreshed.tsx`

#### Frontend — page & app shell

- [ ] T087 [US1] `<Dashboard>` page — composes the components above; uses TanStack Query for `latest` (`refetchInterval: 30_000`, background); implements first-visit auto-trigger effect: on mount, if `latest` resolves to 204, call `api.refresh()` exactly once (guarded so the effect doesn't re-fire in StrictMode); otherwise do not; in `frontend/src/pages/Dashboard.tsx` (depends on T075, T079, T081, T082, T083, T084, T085, T086)
- [ ] T088 [US1] `<App>` shell — `QueryClientProvider`, single route (`/` → Dashboard); in `frontend/src/App.tsx` (depends on T087)

#### US1 validation

- [ ] T089 [US1] Local validation: run `pnpm -r typecheck && pnpm -r lint && pnpm -r test:unit && pnpm -r test:integration` — all green; no skips
- [ ] T090 [US1] Manual acceptance walkthrough per [`quickstart.md`](./quickstart.md) §"Verifying the feature against the spec": US1, Partial rendering, Idempotent refresh — record outcome in the PR description

**Checkpoint**: MVP is shippable. `POST /api/snapshots/refresh` produces and persists a snapshot end-to-end; the dashboard renders the composite + breakdown; repeat refreshes in the same slot dedup; one-source failure produces a partial composite. Phases 4 / 5 can then be tackled incrementally.

---

## Phase 4: User Story 2 — Automatic refresh and durable history (Priority: P2) ⏸ DEFERRED

**Status**: deferred post-MVP per the clarification answer that dropped cron for the MVP. Do not start this phase until `/speckit-plan` is re-run to pick a US2 scheduler (the answer is *not* predetermined — options include re-adding a Worker `scheduled` handler if we reimplement the TradingView protocol natively in Workers, a GH Actions scheduled workflow calling `/refresh`, or an external hosted-cron service).

**Goal** (when US2 lands): `/refresh` is invoked automatically every 30 minutes without user action; history accumulates at a known cadence; SC-002 and SC-005's original wording become evaluable.

**Independent Test** (when US2 lands): leave the deployed dashboard alone for 2 hours; verify exactly 4 new `snapshots` rows with correctly-aligned `slot_ts` values; verify dedup under double-trigger; verify `stale-source` propagation across market-close boundary.

### Implementation for User Story 2 (placeholder — to be expanded after US2 is re-planned)

- [ ] T091 [US2] Choose the US2 scheduler and update `plan.md` with the decision
- [ ] T092 [US2] Implement the scheduler (re-add Worker `scheduled` handler, GH Actions workflow, or external cron) per T091
- [ ] T093 [P] [US2] Reinstate the stale-data badge in `frontend/src/components/StaleBadge.tsx` and the corresponding row in `contracts/ui-contract.md`
- [ ] T094 [P] [US2] Integration test: 2 hours of simulated scheduler ticks, dedup under retry
- [ ] T095 [P] [US2] Integration test: `stale-source` propagation across market-close boundary
- [ ] T096 [P] [US2] SC-002 monitor: rolling 7-day scheduler success-rate, surfaced via `/api/health` or Analytics Engine
- [ ] T097 [US2] Update `spec.md` Implementation Status table: flip the deferred US2 rows to ✅ / ❌ as appropriate
- [ ] T098 [US2] Flip SC-002 from `(deferred post-MVP)` back to active in `spec.md`

**Checkpoint**: automatic 30-min cadence is live; SC-002 becomes measurable.

---

## Phase 5: User Story 3 — Review historical trend (Priority: P3) ⏸ DEFERRED

**Status**: deferred post-MVP per the Implementation Status table in `spec.md`. Only meaningful once US2 is producing durable history.

**Goal** (when US3 lands): user picks a range (24 h / 7 d / 30 d / all), sees composite + per-source lines; upstream-outage gaps are visible; long ranges down-sample server-side.

**Independent Test** (when US3 lands): with ≥ 7 days of persisted snapshots, pick "Last 7 days" and see a chart render in < 3 s with the composite + four source lines; outage gaps visible; values match the persisted snapshots.

### Implementation for User Story 3

- [ ] T099 [P] [US3] Server-side down-sampling SQL for `raw` / `2h` / `1d` resolutions in `backend/src/storage/snapshots.ts` (per data-model.md §"Query patterns")
- [ ] T100 [P] [US3] Range validation (`from`/`to`, resolution enum, ≤ 5-year window) in `backend/src/routes/snapshots.ts`
- [ ] T101 [P] [US3] Per-source range endpoint in `backend/src/routes/sources.ts` (`GET /api/sources/:sourceId` historical)
- [ ] T102 [P] [US3] `<HistoryChart>` step-line chart (Recharts) rendering composite + per-source series; in `frontend/src/components/HistoryChart.tsx`
- [ ] T103 [P] [US3] `<Sp500CandleChart>` (lightweight-charts) rendering 30-min candles; in `frontend/src/components/Sp500CandleChart.tsx`
- [ ] T104 [P] [US3] `<RangePicker>` — 24 h / 7 d / 30 d / custom; in `frontend/src/components/RangePicker.tsx`
- [ ] T105 [P] [US3] Gap rendering for partial / no-data snapshots (broken segments, not interpolated); in the chart components above
- [ ] T106 [US3] `<History>` page composing chart + range picker + navigation from Dashboard; in `frontend/src/pages/History.tsx`
- [ ] T107 [P] [US3] Integration test: 30-day range renders; down-sampling correct against a seeded DB
- [ ] T108 [P] [US3] Integration test: gaps show for partial snapshots
- [ ] T109 [US3] SC-004 verification — 30-day view renders in < 3 s on the reference profile

**Checkpoint**: users can explore history; SC-004 measurable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: work that spans stories and is best done after each increment is in.

- [ ] T110 [P] Update `specs/001-market-sentiment-score/HANDOFF.md` — reflect on-demand architecture, three-workspace layout, `TRADINGVIEW_SIDECAR_URL` instead of `CRON_SECRET`, drop GH Actions cron references
- [ ] T111 [P] Update `specs/001-market-sentiment-score/contracts/ui-contract.md` — remove the "Stale" row from the Dashboard view's state table for MVP (reinstated by US2)
- [ ] T112 [P] Update `README.md` — bring-up sequence (deploy sidecar first, then D1 / Worker / Pages, then `curl /refresh`)
- [ ] T113 [P] Verify `CLAUDE.md` `<!-- SPECKIT START -->…<!-- SPECKIT END -->` still points to `specs/001-market-sentiment-score/plan.md`
- [ ] T114 [P] Lighthouse budgets in `frontend/lighthouserc.json` per Principle IV (TTI ≤ 2.5 s, JS ≤ 150 KB gzipped)
- [ ] T115 [P] Bundlewatch config in `frontend/bundlewatch.config.json` (+10% fail threshold)
- [ ] T116 [P] Workers Analytics Engine observability — counters `refresh.success{source}`, `refresh.failure{source, reason}`, `refresh.duration_ms{source}`, `refresh.dedup_count`; wire in `backend/src/orchestrator.ts` + `backend/src/routes/refresh.ts`
- [ ] T117 [P] Axe-core accessibility audit on `<Dashboard>` + `<History>` in CI (Vitest + jsdom; axe assertions zero-violations)
- [ ] T118 [P] Playwright E2E scaffold in `frontend/tests/e2e/dashboard.spec.ts` — first-visit auto-trigger flow against a deployed preview
- [ ] T119 Deployment dry-run per `quickstart.md` "First deploy (from a fresh Cloudflare + Vercel account)" sequence — confirm each step against a clean environment before real deploy

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup & Cleanup)**: starts immediately, no dependencies.
- **Phase 2 (Foundational)**: starts after Phase 1. Blocks all user stories.
- **Phase 3 (US1 — MVP)**: starts after Phase 2. **MVP ships here.**
- **Phase 4 (US2)**: deferred; requires a re-plan before starting.
- **Phase 5 (US3)**: deferred; depends on US2 (needs real history).
- **Phase 6 (Polish)**: runs after whichever user stories have landed.

### Within User Story 1

1. Tests (T037–T059) — **must fail before implementation**, per Principle II.
2. Sidecar implementation (T060–T064) — unblocks backend fetchers.
3. Backend fetchers (T065–T066) — unblock orchestrator.
4. Orchestrator + refresh route (T067–T068).
5. Supporting read routes (T069–T071), router + worker entry (T072–T073).
6. Frontend lib (T074–T078) — unblocks components.
7. Components (T079–T086).
8. Page + App shell (T087–T088).
9. Validation (T089–T090).

### Parallel Opportunities

- **Phase 1**: T001–T011 all `[P]` except T003 (rename is the only serialisation point; T004–T008 depend on T003).
- **Phase 2**: T012–T036 all `[P]` — disjoint files, no runtime dependencies.
- **US1 tests**: T037–T059 all `[P]` — each touches its own file and can be written in parallel.
- **Sidecar fetchers**: T060–T063 all `[P]`; T064 joins them.
- **Backend fetchers**: T065–T066 `[P]`.
- **Frontend lib + components**: T074–T086 mostly `[P]` (T081 joins T080; T087 joins most).
- **Polish**: T110–T118 all `[P]`.

---

## Parallel Example: User Story 1 Tests

```bash
# All US1 test tasks can be written in parallel (different files, no dependencies):
Task: "Unit tests for slot rounding in backend/tests/unit/slot.test.ts"            # T037
Task: "Unit tests for flag evaluation in backend/tests/unit/flags.test.ts"         # T038
Task: "Unit tests for red-day streak in backend/tests/unit/red-streak.test.ts"     # T039
Task: "Unit tests for composite in backend/tests/unit/composite.test.ts"           # T040
Task: "Unit tests for CNN parser in backend/tests/unit/cnn-fg.parser.test.ts"      # T041
Task: "Unit tests for sidecar parser in backend/tests/unit/sidecar.parser.test.ts" # T042
Task: "Integration test /refresh happy path in backend/tests/integration/refresh.test.ts" # T043
Task: "Integration test /refresh idempotency in backend/tests/integration/idempotent.test.ts" # T044
# ...through T059
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (cleanup) — one sitting, lots of `git rm` + `git mv`.
2. Phase 2 (foundational) — mostly "verify existing files still match the plan"; small edits to `env.ts`, `wrangler.toml`, and workspace metadata.
3. Phase 3 (US1) — **tests first**, then sidecar, then backend fetchers → orchestrator → routes, then frontend lib → components → Dashboard.
4. **STOP and VALIDATE**: T089 all-green + T090 manual acceptance walk. Deploy to Cloudflare + Vercel per `quickstart.md` §"First deploy".

### Incremental Delivery

1. MVP ships (US1). Collect real usage feedback.
2. Re-run `/speckit-plan` scoped to US2 (decide the scheduler), then execute Phase 4.
3. Re-run `/speckit-plan` scoped to US3, then execute Phase 5.
4. Phase 6 polish can interleave after each increment.

### Parallel Team Strategy (if staffed)

- Dev A: Phase 3 backend (tests → fetchers → orchestrator → routes)
- Dev B: Phase 3 sidecar (tests → fetchers → `api/fetch.ts`)
- Dev C: Phase 3 frontend (tests → lib → components → Dashboard)
- Integrate at T072 / T073 (backend router composition) and T087 (Dashboard page).

---

## Notes

- Tests are **required**, not optional — Constitution Principle II is non-negotiable.
- `[P]` tasks = different files + no incomplete dependencies. When in doubt, serialise.
- "Verify existing …" tasks in Phase 2 mean: read the file, confirm it still matches the refreshed plan, make the minimal adjustments if it drifted; they are not no-ops.
- The working tree currently has pre-pivot code; Phase 1 removes it, Phase 3 re-lands the replacements. Do not skip Phase 1.
- Commit after each logical group (e.g., after all tests for US1, after sidecar is deploy-ready, after backend refresh is green, after frontend is green).
- Stop at the MVP checkpoint. Do not start US2 without a re-plan.
