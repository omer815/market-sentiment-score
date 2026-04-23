# Implementation Plan: Market Sentiment Score Dashboard

**Branch**: `001-market-sentiment-score` | **Date**: 2026-04-23 (refreshed) | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-market-sentiment-score/spec.md`

## Summary

A free-tier, serverless web dashboard that evaluates **four binary flags**
worth 25 points each — VIX > 30, CNN Fear & Greed < 20, S5FI < 20, and three
consecutive red S&P 500 daily closes — producing a composite score in
`{0, 25, 50, 75, 100}` rendered as a red-to-green heatmap.

**Trigger model (MVP)**: on-demand, not scheduled. The Worker exposes
`POST /api/snapshots/refresh` which fetches all four sources, scores them,
writes one snapshot to D1, and returns it. Writes are idempotent on the
clock-aligned 30-min `slot_ts` (D1 PK) so repeat calls in the same slot
return the existing row. Automatic 30-minute cadence (US2) is **deferred
post-MVP** — FR-001, FR-015 "automatic refresh", SC-002, and SC-003 are
not in scope for MVP and are tracked in [`spec.md` Implementation Status](./spec.md#implementation-status-as-of-2026-04-23).

**Data path**: CNN F&G is fetched directly from the Worker over HTTPS.
VIX / S&P 500 daily / S5FI come from TradingView, which requires a raw
WebSocket — not compatible with Cloudflare Workers' V8 isolates. A tiny
**Node serverless sidecar on Vercel** wraps `@mathieuc/tradingview` behind
a single `POST /fetch` endpoint; the Worker calls it over HTTPS. The
sidecar is stateless, open, and holds no secrets.

**Deployment surface**: Cloudflare Workers (API + orchestrator), Cloudflare
D1 (SQLite), Cloudflare Pages (SPA), Vercel Hobby (Node sidecar). All four
on free tiers.

**Note on working-tree drift**: the repo currently contains
`scripts/cron/`, `.github/workflows/cron.yml`, and `backend/src/routes/ingest.ts`
from the prior (GH-Actions-scheduled) plan. Those will be removed /
reshaped during the implementation step that follows this plan — see the
**Project Structure** tree below for the target layout.

## Technical Context

**Language/Version**: TypeScript 5.5 on the Cloudflare Workers runtime (V8
isolates, WinterCG-compatible) for the API + orchestrator; TypeScript 5.5
on Node 20 for the Vercel sidecar; TypeScript + React 18 + Vite 5 for the
frontend.
**Primary Dependencies**: Hono (HTTP router in Workers), Zod (runtime
validation), Drizzle ORM (D1-compatible), `@mathieuc/tradingview@3.5.0`
(sidecar only — Node WebSocket client for TradingView), React 18 + Vite 5,
TanStack Query 5, Recharts (future US3 charts), lightweight-charts 4
(future US3 candles).
**Storage**: Cloudflare D1 (SQLite). Free tier: 5 GB, 25M row reads/day,
50K row writes/day. Our write pattern is one row per on-demand refresh —
orders of magnitude inside the quota.
**Testing**: Vitest 1 (unit + integration) in the backend; Miniflare 3 +
local D1 SQLite for integration tests (real DB, mocked external HTTP per
the constitution); Vitest 1 in the sidecar with a mocked TradingView
WebSocket; Playwright 1.44 + axe-core for eventual E2E on the frontend.
**Target Platform**: Web — Cloudflare Workers (API) + Cloudflare Pages
(SPA) + Vercel Hobby Node serverless (sidecar). Supported browsers: last
two majors of Chrome, Safari, Firefox, Edge. Responsive from 375×667 to
1920×1080.
**Project Type**: Web application, three workspaces (backend Worker +
frontend SPA + sidecar Node function) in one pnpm monorepo.
**Performance Goals** (Principle IV):
- TTI ≤ 2.5 s (p75).
- Interaction latency ≤ 100 ms (p95).
- API response ≤ 300 ms (p95) for read endpoints; `/api/snapshots/refresh`
  is an exception — it performs upstream fetches and is budgeted at
  ≤ 6 s (p95) end-to-end including the sidecar round-trip, because it
  blocks on CNN + three TradingView symbol resolves.
- Frontend initial JS ≤ 150 KB gzipped.
**Constraints**:
- Entirely inside Cloudflare + Vercel free tiers. No paid tier in v1.
- No scheduled cron in MVP. The UI or the operator triggers `/refresh`
  explicitly.
- Workers subrequest limit (50 per request, free tier) is comfortably
  respected: `/refresh` makes at most 2 outbound subrequests (CNN + sidecar).
- Vercel Hobby execution limit is 10 s per invocation; the sidecar's worst
  case (three parallel TradingView resolves) fits well inside that.
- No authentication on `/refresh` or the sidecar — consistent with the
  prior "make it open" decision. Protected only by D1 PK dedup + Zod
  validation + D1 CHECK constraints.
**Scale/Scope**:
- Writers: on-demand only. Even aggressive manual polling at 1/min would
  produce at most 48 writes/day per 24 h (and most are dedup'd inside the
  same slot).
- Readers: owner-only; a handful of polls per active session at most.
- Views: 1 (the US1 dashboard). `/history` is post-MVP.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0.

| Principle | Plan Compliance | Evidence / How enforced |
|---|---|---|
| **I. Code Quality** | ✅ Pass | TypeScript strict across all three workspaces. ESLint (`@typescript-eslint/strict-type-checked`) + Prettier + `eslint-plugin-sonarjs` for complexity/duplication — wired into CI and pre-commit. No `any` without an inline rationale. Green-main enforced via branch protection. |
| **II. Testing Standards (NON-NEGOTIABLE)** | ✅ Pass | Vitest for unit + integration. Integration tests hit a real D1 SQLite via Miniflare (constitution: "integration tests exercise real collaborators"); only the four upstream HTTP endpoints are mocked. The sidecar has its own unit tests with a mocked TradingView WS. Line + branch coverage ≥ 80% CI gate. Flaky test budget = 0; Playwright (future) runs with retries = 0 in CI. |
| **III. User Experience Consistency** | ✅ Pass | Single design-token file (`frontend/src/styles/tokens.css`) consumed by every component. Every data view renders explicit loading / empty / error / success / partial / stale states per [`contracts/ui-contract.md`](./contracts/ui-contract.md) and is covered by tests. Accessibility: axe-core on key pages in CI (WCAG 2.1 AA). Copy centralised in `frontend/src/lib/copy.ts`. |
| **IV. Performance Requirements** | ✅ Pass (MVP-scoped) | Lighthouse budgets in `frontend/lighthouserc.json`; bundlewatch tracks per-route JS with fail threshold +10%. `/refresh` is long-running by nature — the 6 s p95 budget is tracked separately and the UI shows a busy state during refresh. Observability: Workers Analytics Engine counters on `refresh.success{source}` / `refresh.failure{source, reason}` / `refresh.duration_ms`. **Scoped caveat**: the constitution mandates user-perceived-latency observability "before a feature ships" — for MVP, this covers `/refresh` and the read endpoints. Automatic-cadence observability (success rate of a scheduled fetch) only makes sense once cron comes back in US2 and is deferred with it. |

**Gate: PASS.** No unjustified violations. The MVP trigger-model narrowing
(no cron, FR-001 / FR-015 automatic-refresh / SC-002 / SC-003 deferred) is
a product-scope decision, not a principle violation, and is surfaced in
`spec.md` Implementation Status rather than the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/001-market-sentiment-score/
├── plan.md              # This file (refreshed 2026-04-23, on-demand architecture)
├── spec.md              # Feature spec (complete; Implementation Status tracks MVP scope)
├── research.md          # Phase 0 output (refreshed 2026-04-23)
├── data-model.md        # Phase 1 output (unchanged — D1 schema still applies)
├── quickstart.md        # Phase 1 output (refreshed 2026-04-23)
├── HANDOFF.md           # Cross-machine session context
├── contracts/
│   ├── openapi.yaml     # HTTP API contract (refreshed — /refresh replaces /ingest)
│   └── ui-contract.md   # UI states contract (unchanged)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root, target layout)

```text
backend/                                    # Cloudflare Worker (API + orchestrator)
├── src/
│   ├── worker.ts                           # default export { fetch } — NO scheduled handler
│   ├── router.ts                           # Hono routes: health, sources, snapshots, refresh
│   ├── routes/
│   │   ├── health.ts                       # GET  /api/health
│   │   ├── sources.ts                      # GET  /api/sources, GET /api/sources/:id
│   │   ├── snapshots.ts                    # GET  /api/snapshots, GET /api/snapshots/latest
│   │   └── refresh.ts                      # POST /api/snapshots/refresh (new — replaces ingest)
│   ├── orchestrator.ts                     # fetch(CNN) || sidecar(/fetch) → score → insertSnapshot
│   ├── fetchers/
│   │   ├── cnn-fg.ts                       # HTTPS — production.dataviz.cnn.io
│   │   ├── sidecar.ts                      # HTTPS — POST ${TRADINGVIEW_SIDECAR_URL}/fetch
│   │   └── types.ts                        # shared FetchResult<T>
│   ├── scoring/
│   │   ├── flags.ts                        # evaluateVix/Fg/S5fi/Sp500 (unchanged)
│   │   └── composite.ts                    # computeComposite (unchanged)
│   ├── storage/
│   │   ├── schema.ts                       # Drizzle tables (unchanged)
│   │   ├── client.ts                       # createDb(d1) (unchanged)
│   │   ├── snapshots.ts                    # insert/query/dedup-by-slot (unchanged)
│   │   ├── sources.ts                      # listSources (unchanged)
│   │   └── migrations/                     # 0001_init.sql, 0002_seed_sources.sql (unchanged)
│   ├── lib/{slot,time,errors}.ts           # (unchanged)
│   ├── config.ts                           # ScoringConfig from env (unchanged)
│   └── env.ts                              # Env: DB + threshold vars + TRADINGVIEW_SIDECAR_URL
├── tests/
│   ├── unit/
│   │   ├── slot.test.ts                    # (unchanged)
│   │   ├── flags.test.ts                   # (unchanged)
│   │   └── composite.test.ts               # (unchanged)
│   └── integration/
│       ├── refresh.test.ts                 # Miniflare + local D1 + mocked CNN + mocked sidecar
│       └── snapshots.api.test.ts           # read endpoints against seeded D1
├── wrangler.toml                           # D1 binding, vars (no cron, no CRON_SECRET)
├── package.json
└── tsconfig.json

scripts/tradingview-sidecar/                # Node serverless function on Vercel (was: scripts/cron/)
├── api/
│   └── fetch.ts                            # POST /fetch handler (Vercel filesystem routing)
├── src/
│   ├── tradingview.ts                      # promise wrapper over @mathieuc/tradingview
│   └── fetchers/
│       ├── vix.ts                          # getQuote('CBOE:VIX')
│       ├── sp500-daily.ts                  # getCandles('CBOE:SPX', 'D', 10)
│       └── s5fi.ts                         # getQuote('INDEX:S5FI')
├── tests/unit/
│   └── fetchers.test.ts                    # mocked TV WebSocket
├── vercel.json                             # Node 20, function region pinning
├── package.json                            # @mathieuc/tradingview only
└── tsconfig.json

frontend/                                   # Cloudflare Pages (React + Vite SPA) — unchanged
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   └── Dashboard.tsx                   # US1 — composite + breakdown + refresh button
│   ├── components/
│   │   ├── CompositeHeatmap.tsx            # FR-016
│   │   ├── ScoringBreakdown.tsx            # FR-017
│   │   ├── FlagRow.tsx
│   │   ├── RefreshButton.tsx               # NEW — calls POST /api/snapshots/refresh
│   │   ├── PartialBadge.tsx
│   │   ├── StaleBadge.tsx
│   │   ├── EmptyState.tsx
│   │   └── ErrorState.tsx
│   ├── lib/
│   │   ├── api.ts                          # typed client for contracts/openapi.yaml
│   │   ├── copy.ts                         # centralised UI strings
│   │   ├── heatmap.ts
│   │   └── api-types.ts
│   └── styles/
│       ├── tokens.css                      # design tokens
│       └── global.css
├── tests/unit                              # Vitest + Testing Library
├── vite.config.ts
├── index.html
├── package.json
└── tsconfig.json

.github/workflows/
└── ci.yml                                  # lint, typecheck, unit tests
                                            # (cron.yml is REMOVED from the target layout)
```

**Structure Decision**: three workspaces in one pnpm monorepo — backend
Worker, frontend SPA, and the tiny Vercel sidecar. The sidecar is the
narrowest possible boundary around the one Node-only dependency
(`@mathieuc/tradingview`) that can't run in Workers. Everything else —
orchestration, scoring, storage, CNN F&G — lives inside the Worker so the
Worker remains the single source of truth for business logic. The sidecar
is stateless, holds no secrets, and can be redeployed or replaced without
touching Worker or frontend code.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*Not applicable — Constitution Check passed without violations.* The MVP
narrowing (no cron, US2/US3 deferred) is a product-scope decision
recorded in `spec.md` Implementation Status; it does not deviate from any
constitutional principle.
