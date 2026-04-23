# Market Sentiment Score

A 0–100 market buy/sell score computed from four public sources, refreshed every 30 minutes and persisted for historical tracking.

## What it scores

Each source contributes **25 points** when its defensive flag triggers. The composite is the sum, so it is always one of `{0, 25, 50, 75, 100}` — rendered as a red-to-green heatmap (0 red → 100 green).

| Source                       | Flag rule                                     | Cadence |
| ---------------------------- | --------------------------------------------- | ------- |
| CBOE VIX                     | `VIX > 30`                                    | 30 min  |
| CNN Fear & Greed             | `CNN F&G < 20`                                | 30 min  |
| S&P 500 above 50-DMA (S5FI)  | `S5FI < 20`                                   | 1 day   |
| S&P 500 daily streak         | `≥ 3 consecutive red daily closes`            | 1 day   |

A snapshot whose sources all failed is stored with `status = 'no-data'` (no composite). If some failed and others succeeded, `status = 'partial'` and only the successful points are counted.

## Repo layout

```
.specify/                — Spec Kit workflow artefacts (constitution, templates, extensions)
specs/                   — Feature specs
  001-market-sentiment-score/
    spec.md              — WHAT & WHY
    plan.md              — HOW (tech stack, structure)
    research.md          — locked decisions + rationale
    data-model.md        — D1 schema + state transitions
    contracts/
      openapi.yaml       — REST contract
      ui-contract.md     — UI state contracts + copy catalogue
    quickstart.md        — end-to-end validation walkthrough
    tasks.md             — 104-task execution plan (T001…T104)
backend/                 — Cloudflare Worker (Hono + D1 + Drizzle)
  src/
    fetchers/            — vix, cnn-fg, s5fi, sp500-daily, sp500-intraday
    scoring/             — flags (4 pure rules) + composite
    storage/             — Drizzle schema, migrations, snapshot/source queries
    routes/              — /api/health, /api/sources, /api/snapshots*
    cron.ts              — orchestrates fetch → flag → composite → persist
    worker.ts            — default export { fetch, scheduled }
  tests/unit/            — vitest unit tests
  wrangler.toml          — Cloudflare config (cron, D1 binding, thresholds)
frontend/                — React + Vite SPA (deployed on Pages)
  src/
    components/          — CompositeHeatmap, ScoringBreakdown, FlagRow, …
    lib/                 — typed API client, copy catalogue, heatmap tokens
    pages/Dashboard.tsx  — MVP page
```

## Architecture

- **Cloudflare Workers** runs the HTTP API and the 30-minute cron (`0,30 * * * *` UTC).
- **Cloudflare D1** stores snapshots and source readings. Primary key on `slot_ts` makes inserts idempotent.
- **Cloudflare Pages** hosts the SPA; it calls the Worker over the shared origin.

All code is written but **nothing has been installed or executed yet** — per the owner's preference to keep the Mac quiet. The next steps are:

```bash
# 1. Install — run once
pnpm install

# 2. Create the D1 database and paste the returned id into backend/wrangler.toml
cd backend
npx wrangler d1 create market-sentiment

# 3. Apply migrations locally (to .wrangler/state/…)
pnpm db:migrate:local

# 4. Dev server (local-only)
pnpm dev           # backend on :8787
cd ../frontend
pnpm dev           # SPA on :5173 → proxies /api to :8787

# 5. Deploy to Cloudflare
cd ../backend
pnpm db:migrate    # apply migrations to the remote D1
pnpm deploy
```

## Status — MVP only

**Implemented only through the MVP (User Story 1 — "See the current buy/sell score at a glance").** User Stories 2 and 3 from the spec are **not yet built**, and nothing has been installed, deployed, or executed — all code is source-only.

- ✅ Spec, plan, research, data model, contracts, quickstart, tasks (104 items), constitution
- ✅ Backend source: fetchers, scoring flags + composite, D1 schema + migrations, routes, cron handler
- ✅ Frontend source: heatmap, scoring breakdown, flag rows, empty/error/stale/partial states, auto-refresh polling
- ✅ CI workflow (`.github/workflows/ci.yml`): typecheck + lint + unit tests
- ❌ **Not yet built**: historical charts, S&P 500 candle chart UI, Playwright E2E, accessibility tests, observability/alerting, deployment to Cloudflare
- ❌ **Not yet executed**: no `pnpm install`, no `wrangler d1 create`, no migrations applied, no Worker deploy, no Pages deploy, no live cron tick observed

See [`specs/001-market-sentiment-score/spec.md`](specs/001-market-sentiment-score/spec.md) — the "Implementation Status" table at the top — and [`specs/001-market-sentiment-score/tasks.md`](specs/001-market-sentiment-score/tasks.md) for the remaining task list.

See [`specs/001-market-sentiment-score/tasks.md`](specs/001-market-sentiment-score/tasks.md) for the remaining work items.
