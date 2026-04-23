# Implementation Plan: Market Sentiment Score Dashboard

**Branch**: `001-market-sentiment-score` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-market-sentiment-score/spec.md`

## Summary

A free-tier, serverless web dashboard that fetches four market-sentiment
signals on a clock-aligned `:00` / `:30` UTC cron schedule and evaluates
**four binary flags** worth 25 points each — VIX > 30, CNN Fear & Greed
< 20, S5FI < 20, and three consecutive red S&P 500 daily closes. The
composite score is the sum (∈ `{0, 25, 50, 75, 100}`) and is rendered as
a red-to-green heatmap (0 = red, 100 = green). Each snapshot is persisted
to durable storage; the UI also shows per-flag ✓/✗ breakdowns, a historical
trend chart, and an S&P 500 30-min candle chart. Failed source fetches
contribute 0 points and the snapshot is flagged `partial`. Deployment
target is Cloudflare's free tier: Workers (fetcher + HTTP API + cron), D1
(SQLite database), and Pages (static frontend).

## Technical Context

**Language/Version**: TypeScript 5.5 on Cloudflare Workers runtime (V8
isolates, WinterCG-compatible), Node 20 for local tooling
**Primary Dependencies**: Hono (HTTP router in Workers), Zod (runtime schema
validation), Drizzle ORM (D1-compatible), React 18 + Vite 5 (frontend),
Recharts (historical line charts), lightweight-charts 4 (S&P 500 candles),
TanStack Query 5 (frontend polling + cache)
**Storage**: Cloudflare D1 (SQLite, managed, free tier: 5 GB, 25M row reads/day)
**Testing**: Vitest 1 (unit + integration), Miniflare 3 (local Worker + D1),
Playwright 1.44 (E2E against preview deploy), axe-core (accessibility)
**Target Platform**: Web — Cloudflare Workers (fetcher + API) + Cloudflare
Pages (static SPA). Supported browsers: last 2 major versions of Chrome,
Safari, Firefox, Edge. Responsive from 375×667 up to 1920×1080.
**Project Type**: Web application (backend Worker + frontend SPA)
**Performance Goals** (from Principle IV):
- TTI ≤ 2.5 s (p75)
- Interaction latency ≤ 100 ms (p95)
- API response ≤ 300 ms (p95)
- Frontend initial JS ≤ 150 KB gzipped
**Constraints**:
- Must fit entirely in Cloudflare free tier (no paid upgrades in v1)
- Cron cadence 30 min, clock-aligned (`*/30 * * * *` = `0,30 * * * *`)
- All external fetches must complete inside a single Worker cron invocation
  (CPU time limit applies — fetches run in parallel with a combined wall
  budget of ≤ 20 s)
- No authentication; public endpoints. Rate limiting via Cloudflare's free
  edge rules.
**Scale/Scope**:
- 1 writer (cron), ~handful of readers. At 30-min cadence: 48 snapshots/day
  × 365 = 17,520 rows/year — trivial for D1.
- ~5 UI views: current dashboard (home), historical chart (time-range
  tabs), S&P 500 candles, source detail (per source), health/status.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0.

| Principle | Plan Compliance | Evidence / How enforced |
|---|---|---|
| **I. Code Quality** | ✅ Pass | TypeScript strict mode, ESLint (`@typescript-eslint/strict-type-checked`), Prettier, `eslint-plugin-sonarjs` for complexity/duplication — all wired into CI and pre-commit. No `any` without inline rationale; green-main enforced by branch protection. |
| **II. Testing Standards (NON-NEGOTIABLE)** | ✅ Pass | Vitest for unit + integration; Miniflare provides a real Workers runtime and a real (local) D1 SQLite — integration tests hit real collaborators per the constitution. Playwright for E2E. Test-first policy enforced in PR review. Line+branch coverage ≥ 80% CI gate. No flaky-test tolerance: Playwright retries=0 in CI. |
| **III. User Experience Consistency** | ✅ Pass | Single design-token file (`frontend/src/styles/tokens.css`) consumed by every component. Every data view renders explicit loading / empty / error / success / partial states (tested). Accessibility: axe-core run on each component story and on key pages in CI (WCAG 2.1 AA). Copy centralised in `frontend/src/lib/copy.ts` to enforce terminology consistency. |
| **IV. Performance Requirements** | ✅ Pass | Lighthouse budgets committed to `frontend/lighthouserc.json`; bundlewatch tracks per-route JS size with fail threshold +10%. Historical queries use server-side down-sampling for ranges > 7 days (D1 SQL aggregates; never returns > 1,000 points to the browser). Observability: Workers Analytics Engine for fetch success/failure counts + latency; Cloudflare's free Workers Logs for errors. |

**Gate: PASS.** No violations — `Complexity Tracking` table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-market-sentiment-score/
├── plan.md              # This file
├── spec.md              # Feature spec (complete)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/
│   ├── openapi.yaml     # HTTP API contract (backend ↔ frontend)
│   └── ui-contract.md   # UI states contract (loading/empty/error/success/partial)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
backend/                               # Cloudflare Worker (fetcher + HTTP API + cron)
├── src/
│   ├── worker.ts                      # fetch + scheduled handler entry
│   ├── router.ts                      # Hono HTTP routes
│   ├── fetchers/
│   │   ├── vix.ts                     # Yahoo Finance /v8/finance/chart/^VIX
│   │   ├── cnn-fg.ts                  # CNN dataviz endpoint (aggregator path)
│   │   ├── sp500-daily.ts             # Yahoo Finance /v8/finance/chart/^GSPC 1d (scoring)
│   │   ├── sp500-intraday.ts          # Yahoo Finance /v8/finance/chart/^GSPC 30m (UI candles)
│   │   ├── s5fi.ts                    # Yahoo Finance /v8/finance/chart/^S5FI
│   │   └── types.ts                   # shared FetchResult type
│   ├── scoring/
│   │   ├── flags.ts                   # per-source threshold rules (VIX>30, F&G<20, S5FI<20, 3-red-days)
│   │   └── composite.ts               # sum of 25-point flags; partial-aware
│   ├── storage/
│   │   ├── schema.ts                  # Drizzle tables
│   │   ├── snapshots.ts               # insert / query / dedup-by-slot
│   │   └── migrations/                # `wrangler d1 migrations`
│   ├── routes/
│   │   ├── snapshots.ts               # GET /api/snapshots/latest, /snapshots
│   │   ├── sources.ts                 # GET /api/sources
│   │   └── health.ts                  # GET /api/health
│   ├── lib/
│   │   ├── slot.ts                    # round-to-:00/:30 UTC helper
│   │   ├── time.ts                    # ISO helpers
│   │   └── errors.ts                  # fetch failure taxonomy
│   └── config.ts                      # env vars, source weights
├── tests/
│   ├── unit/
│   │   ├── flags.test.ts
│   │   ├── composite.test.ts
│   │   └── slot.test.ts
│   ├── integration/
│   │   ├── cron.test.ts               # end-to-end cron via Miniflare + D1
│   │   ├── snapshots.api.test.ts
│   │   └── fetchers.contract.test.ts  # per-source parser tests against recorded fixtures
│   └── fixtures/
│       ├── vix/
│       ├── cnn-fg/
│       ├── sp500/
│       └── s5fi/
├── wrangler.toml                      # Workers + D1 + cron binding
├── package.json
└── tsconfig.json

frontend/                              # Cloudflare Pages (React + Vite SPA)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx              # US1: current composite + per-source
│   │   └── History.tsx                # US3: historical trend + S&P candles
│   ├── components/
│   │   ├── CompositeHeatmap.tsx       # red-to-green gradient bar + numeric + label (FR-016)
│   │   ├── ScoringBreakdown.tsx       # per-flag rows: rule, raw value, ✓/✗, points (FR-017)
│   │   ├── FlagRow.tsx                # one row in the breakdown
│   │   ├── HistoryChart.tsx           # Recharts step-line chart (composite is discrete)
│   │   ├── Sp500CandleChart.tsx       # lightweight-charts candlesticks
│   │   ├── PartialBadge.tsx
│   │   ├── StaleBadge.tsx
│   │   ├── EmptyState.tsx
│   │   └── ErrorState.tsx
│   ├── lib/
│   │   ├── api.ts                     # typed client for /contracts/openapi.yaml
│   │   ├── copy.ts                    # centralised UI strings
│   │   └── format.ts
│   └── styles/
│       └── tokens.css                 # design tokens (shared with every component)
├── tests/
│   ├── unit/                          # component tests with Vitest + Testing Library
│   └── e2e/
│       ├── dashboard.spec.ts
│       └── history.spec.ts
├── lighthouserc.json                  # performance budgets
├── bundlewatch.config.json
├── vite.config.ts
├── index.html
├── package.json
└── tsconfig.json

.github/workflows/
├── ci.yml                             # lint, typecheck, unit, integration, bundle, Lighthouse
└── deploy.yml                         # wrangler deploy (backend) + pages deploy (frontend)
```

**Structure Decision**: Web-application layout (backend + frontend) chosen
because the product is a browser-facing dashboard backed by a scheduled
fetcher and a shared database. The Cloudflare platform colocates all three
concerns (Workers, D1, Pages) in one free-tier account, so there is no
cross-provider operational overhead despite the two project roots.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*Not applicable — Constitution Check passed without violations.*
