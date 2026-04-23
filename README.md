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
specs/
  001-market-sentiment-score/
    spec.md              — WHAT & WHY + Implementation Status
    plan.md              — HOW (tech stack, structure)
    research.md          — locked decisions + rationale
    data-model.md        — D1 schema + state transitions
    contracts/
      openapi.yaml       — REST contract (incl. POST /api/cron/ingest)
      ui-contract.md     — UI state contracts + copy catalogue
    quickstart.md        — end-to-end validation walkthrough
    tasks.md             — 104-task execution plan
    HANDOFF.md           — single-read briefing for next session
.github/workflows/
  ci.yml                 — typecheck + lint + unit tests (push/PR)
  cron.yml               — 30-min scheduled runner for scripts/cron
scripts/cron/            — Node workspace (runs on GH Actions)
  src/
    run.ts               — entrypoint
    tradingview.ts       — promise wrapper over @mathieuc/tradingview
    fetchers/            — vix, s5fi, sp500-daily (TradingView) + cnn-fg (CNN dataviz)
    scoring.ts           — flag rules + composite (mirror of backend/src/scoring)
    slot.ts, types.ts, post.ts
backend/                 — Cloudflare Worker (read + ingest only)
  src/
    routes/              — health, sources, snapshots, ingest
    scoring/             — kept for future re-scoring + unit tests
    storage/             — Drizzle schema, migrations, queries
    fetchers/types.ts    — SourceId + FetchStatus types (fetchers themselves moved to scripts/cron)
    worker.ts            — default export { fetch } (no scheduled)
    router.ts, env.ts, config.ts, lib/{slot,time,errors}.ts
  tests/unit/            — vitest: slot, flags, composite
  wrangler.toml          — Cloudflare config (D1 binding, thresholds, cron disabled)
frontend/                — React + Vite SPA (deployed on Pages)
  src/
    components/          — CompositeHeatmap, ScoringBreakdown, FlagRow, …
    lib/                 — typed API client, copy catalogue, heatmap tokens
    pages/Dashboard.tsx  — MVP page
```

## Architecture

- **GitHub Actions** runs the 30-minute cron (`.github/workflows/cron.yml`, `0,30 * * * *` UTC). The workflow invokes `scripts/cron/` — a small Node workspace that pulls VIX / S&P 500 daily / S5FI via the [`@mathieuc/tradingview`](https://www.npmjs.com/package/@mathieuc/tradingview) package and CNN Fear & Greed from CNN's own dataviz JSON, scores the four flags, and POSTs the resulting snapshot to the Worker.
- **Cloudflare Workers** serves the HTTP API only: public GET endpoints for the dashboard, plus a bearer-authenticated `POST /api/cron/ingest` that accepts pre-computed snapshots from the cron runner.
- **Cloudflare D1** stores snapshots and source readings. Primary key on `slot_ts` makes ingest idempotent.
- **Cloudflare Pages** hosts the SPA; it calls the Worker over the shared origin.

The cron lives on GH Actions instead of Cloudflare's own cron triggers because the TradingView npm package uses Node `net`/`tls` WebSockets — not supported in Workers' V8 isolates.

All code is written but **nothing has been installed or executed yet** — per the owner's preference to keep the Mac quiet. The bring-up sequence is:

```bash
# 1. Install (once — GitHub Actions does this automatically on every CI + cron run)
pnpm install

# 2. Provision D1 and paste the returned id into backend/wrangler.toml
cd backend
npx wrangler d1 create market-sentiment
pnpm db:migrate        # apply migrations to the remote D1

# 3. Set the shared ingest secret on the Worker
#    Pick any long random string — same value goes into GH Actions below.
npx wrangler secret put CRON_SECRET

# 4. Deploy the Worker
pnpm deploy            # → https://market-sentiment-api.<account>.workers.dev

# 5. Deploy the frontend (Cloudflare Pages — dashboard or CLI)
cd ../frontend
pnpm build
npx wrangler pages deploy dist

# 6. Wire GitHub Actions secrets (repo Settings → Secrets → Actions)
#    CRON_SECRET  — same value you set on the Worker
#    WORKER_URL   — the workers.dev URL from step 4
# Optional repo Variables to override thresholds:
#    VIX_THRESHOLD, FG_THRESHOLD, S5FI_THRESHOLD, SP500_RED_DAYS_MIN
```

Once the secrets are in place, the GH Actions cron runs every 30 minutes
and the dashboard updates itself with no further intervention.

> **Resuming on a new machine or in a new session?** Start with
> [`specs/001-market-sentiment-score/HANDOFF.md`](specs/001-market-sentiment-score/HANDOFF.md).

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
