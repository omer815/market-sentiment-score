# Session Handoff — Market Sentiment Score

**Written:** 2026-04-23 · **Last refreshed:** 2026-04-23 (on-demand `/refresh` + Vercel TradingView sidecar pivot) · **Owner:** omer (GitHub: `omer815`) · **Status:** MVP source complete, nothing deployed

This document is the single-read briefing for whoever (human or AI) picks up
this project in a new session / on a new machine. If something here
conflicts with anything else in the repo, **this document wins for
short-term state; `spec.md` wins for product requirements.**

---

## 1. Where everything lives

- **GitHub repo:** https://github.com/omer815/market-sentiment-score (public)
  - `main` — tracks the MVP commit
  - `001-market-sentiment-score` — feature branch; `main` is fast-forwarded to match
  - Both push to the same remote; no PRs between them.
- **Default feature directory:** `specs/001-market-sentiment-score/`
  - Persisted in `.specify/feature.json`.
- **Primary docs to open first** (in order):
  1. This file (`HANDOFF.md`) — current state
  2. `spec.md` — product + the "Implementation Status" table at the top
  3. `plan.md` — on-demand `/refresh` architecture, three-workspace layout
  4. `tasks.md` — 119-task backlog (T001…T090 = MVP, all authored; T091–T119 deferred or polish)
  5. `data-model.md`, `contracts/openapi.yaml`, `contracts/ui-contract.md`, `research.md`, `quickstart.md`

## 2. What is done vs. what is not

**Done (MVP = User Story 1 — "See the current buy/sell score at a glance"):**

- Specs, plan, research, data model, OpenAPI + UI contracts, quickstart, 119-task breakdown.
- Constitution v1.0.0 (`.specify/memory/constitution.md`).
- **TradingView sidecar workspace (`scripts/tradingview-sidecar/`)** — Vercel Node serverless function exposing `POST /fetch`. Wraps `@mathieuc/tradingview` and returns a combined `{vix, sp500, s5fi}` payload. Per-source failures omit the key; HTTP 502 only on full failure. Unit + integration tests authored.
- **Backend Worker (`backend/`)** — Hono router, Drizzle + D1, schema + 2 migrations. Routes:
  - `GET /api/health` — degraded if most-recent snapshot is `no-data` or DB is empty
  - `GET /api/sources`, `GET /api/sources/:id`
  - `GET /api/snapshots`, `GET /api/snapshots/latest` (returns 204 when empty)
  - **`POST /api/snapshots/refresh`** — the single MVP write endpoint; fetches CNN F&G directly + calls the sidecar's `/fetch`, scores, persists, returns the Snapshot. Idempotent on `slot_ts`. Unauthenticated.
  - `backend/src/orchestrator.ts` is the shared fetch→score→persist pipeline.
- Backend unit tests: slot rounding, flag evaluation, red-day streak, composite, CNN F&G parser, sidecar response parser. Integration tests scaffolded (`describe.skip`) — see `backend/tests/integration/README.md`.
- **Frontend (`frontend/`)** — React + Vite + TanStack Query:
  - `<CompositeHeatmap>`, `<ScoringBreakdown>`, `<FlagRow>`, `<PartialBadge>`
  - **New for MVP trigger UX (FR-018):** `<RefreshButton>` (busy-state, invalidates latest query, surfaces errors), `<LastRefreshed>` (re-renders every 30 s), `<EmptyState>` with `firstLoad` / `failed` variants.
  - `<Dashboard>` implements the first-visit auto-trigger (AS1.5) — auto-invokes `/refresh` once when `GET /api/snapshots/latest` returns 204, guarded against StrictMode double-mount.
  - `StaleBadge.tsx` was **deleted** (no stale badge in MVP, per clarification Q3).
  - Relative-time formatter (`frontend/src/lib/relative-time.ts`) + copy catalogue update.
- Design tokens + copy catalogue (ESLint enforces no hard-coded `JSXText` in `frontend/src/components/**`; pages + App exempt).
- GitHub Actions CI (`typecheck` + `lint` + unit + integration) — `.github/workflows/cron.yml` was deleted; only `ci.yml` remains.

**Not done (deliberately, awaiting next session):**

- **Nothing has ever been installed or executed.** No `pnpm install`, no `wrangler`, no `vercel` CLI, no D1 database, no deploy. Owner explicitly asked to keep the Mac quiet — **do not start any local processes without asking first.**
- **User Story 2** (automatic 30-min cadence + durable history beyond MVP): tasks `T091–T098` in `tasks.md` — **deferred**. A US2 re-plan is required to pick the scheduler (Workers WebSocket rewrite / GH Actions / external cron).
- **User Story 3** (historical charts, S&P 500 candle chart, range picker): tasks `T099–T109` — **not built**.
- **Polish phase** (`T110–T119`): HANDOFF refresh (done by this commit), UI-contract trimming, README updates, Lighthouse, bundlewatch, Workers Analytics Engine, axe, Playwright.
- **Deployment** to Cloudflare (D1 create, migrations, Worker deploy, Pages deploy) + Vercel (sidecar deploy). Not done.

See `spec.md` → "Implementation Status" table for the canonical checklist.

## 3. Strict owner preferences (durable — apply in every session)

1. **Keep the Mac quiet.** Do not run `pnpm install`, `npm install`, `wrangler`, `vercel`, `vite`, `vitest`, or any dev server without asking first. Writing source files is fine.
2. **Source-only until the owner says otherwise.** Ask before any command with network or runtime side effects.
3. **Public GitHub repo under `omer815`** — not `omermircor`. The `gh` CLI is configured (`gh auth switch --user omer815`, `gh auth setup-git`). Remote `origin` = `https://github.com/omer815/market-sentiment-score.git`.
4. **Two-branch workflow:** feature branch `001-market-sentiment-score` is where work lands; `main` is fast-forwarded to match, then both are pushed together. No PRs between them.
5. **Commit style:** `<type>: <summary>` header (e.g. `feat:`, `docs:`), detailed body, `Co-Authored-By: Claude …` trailer.
6. **Language:** the owner types fast and sometimes drops articles; infer and confirm, don't ask them to restate.

## 4. Locked product decisions (do NOT re-open without a clarify prompt)

- **Hosting:** Cloudflare free tier — Workers (read API + refresh endpoint), D1 (SQLite), Pages (SPA) — **plus** Vercel Hobby for the tiny TradingView sidecar Node fn. All on free tiers.
- **MVP trigger:** on-demand only. `POST /api/snapshots/refresh` is the single write endpoint (FR-018). No scheduled cron — US2 reintroduces one. The dashboard auto-invokes `/refresh` once on first-ever visit (empty DB / 204), never afterwards.
- **Data providers:**
  - **TradingView** (via `@mathieuc/tradingview` in the Vercel sidecar): `CBOE:VIX`, `CBOE:SPX` daily candles, `INDEX:S5FI`.
  - **CNN Fear & Greed** fetched directly by the Worker from `https://production.dataviz.cnn.io/index/fearandgreed/graphdata`.
- **Why a sidecar?** `@mathieuc/tradingview` uses `ws` → Node `net`/`tls`, which Workers' V8 isolates don't expose (even with `nodejs_compat`). A tiny Vercel Node fn wraps it behind `POST /fetch`; the Worker calls it. Reimplementing TradingView's WebSocket protocol natively in Workers is possible but a multi-day rewrite — deferred.
- **Auth on `/refresh`:** none. Open in v1. Writes idempotent on `slot_ts` (D1 PK); validated by Zod + D1 CHECK constraints. Sidecar is also open. Only `WORKER_URL` and `TRADINGVIEW_SIDECAR_URL` need to be configured; nothing else.
- **Scoring (see `spec.md` FR-005):** four binary flags × 25 points, composite ∈ `{0, 25, 50, 75, 100}`.
  - VIX > 30
  - CNN Fear & Greed < 20
  - S5FI < 20
  - S&P 500 has ≥ 3 consecutive red daily closes (longer streaks also trigger)
  - A failed fetch contributes 0 points and flags the snapshot `partial`.
- **Thresholds are env vars** (`VIX_THRESHOLD`, `FG_THRESHOLD`, `S5FI_THRESHOLD`, `SP500_RED_DAYS_MIN`), runtime-tunable via `wrangler secret put`.
- **Display:** red-to-green heatmap, 5 discrete stops, numeric + text label + ✓/✗ per flag (WCAG AA).
- **Public, no accounts, no allow-list, no CAPTCHA in v1.**
- **Partial snapshots** never carry forward stale values into the composite.

## 5. Repo state snapshot

```
dashboard/
├─ .claude/skills/speckit-git-*/…           (Spec Kit git extension)
├─ .github/workflows/
│  └─ ci.yml                                (typecheck + lint + unit tests on push/PR)
├─ .specify/                                (Spec Kit state — constitution, extensions, feature.json)
├─ scripts/tradingview-sidecar/             (Vercel Node fn — wraps @mathieuc/tradingview)
│  ├─ package.json                          (@market-sentiment/tradingview-sidecar)
│  ├─ tsconfig.json, vercel.json, vitest.config.ts, .gitignore
│  ├─ api/
│  │  └─ fetch.ts                           (POST /fetch — fans out to 3 fetchers)
│  ├─ src/
│  │  ├─ tradingview.ts                     (promise wrapper over the WS package)
│  │  ├─ types.ts                           (local payload types)
│  │  └─ fetchers/{vix,sp500-daily,s5fi}.ts
│  └─ tests/
│     ├─ unit/{vix,s5fi,sp500-daily}.test.ts
│     └─ integration/fetch.test.ts
├─ backend/                                 (Cloudflare Worker — read + refresh ONLY)
│  ├─ wrangler.toml                         (no cron triggers; D1 binding placeholder; TRADINGVIEW_SIDECAR_URL as secret)
│  ├─ package.json, tsconfig.json, vitest.config.ts
│  └─ src/
│     ├─ worker.ts                          (default export { fetch } — no scheduled)
│     ├─ router.ts                          (mounts health/sources/snapshots/refresh)
│     ├─ orchestrator.ts                    (NEW — runRefresh pipeline)
│     ├─ env.ts                             (Env: DB + TRADINGVIEW_SIDECAR_URL + thresholds)
│     ├─ config.ts                          (Zod ScoringConfig from env)
│     ├─ routes/{health,sources,snapshots,refresh}.ts   (NEW refresh.ts)
│     ├─ fetchers/{types,cnn-fg,sidecar}.ts (NEW cnn-fg.ts + sidecar.ts)
│     ├─ scoring/{flags,composite}.ts
│     ├─ storage/{schema,client,snapshots,sources}.ts
│     ├─ storage/migrations/0001_init.sql + 0002_seed_sources.sql
│     └─ lib/{slot,time,errors}.ts
│  └─ tests/
│     ├─ unit/{slot,flags,red-streak,composite,cnn-fg.parser,sidecar.parser}.test.ts
│     └─ integration/{README.md,refresh,idempotent,partial,sidecar-down,read}.test.ts  (describe.skip)
├─ frontend/                                (React + Vite + TanStack Query)
│  ├─ index.html, vite.config.ts, tsconfig.json, package.json
│  └─ src/
│     ├─ main.tsx, App.tsx, test-setup.ts
│     ├─ styles/{tokens.css,global.css}
│     ├─ lib/{api,api-types,copy,heatmap,relative-time}.ts
│     ├─ components/{CompositeHeatmap,FlagRow,ScoringBreakdown,PartialBadge,EmptyState,ErrorState,RefreshButton,LastRefreshed}.tsx
│     ├─ pages/Dashboard.tsx
│     └─ …*.test.tsx                        (relative-time, CompositeHeatmap, PartialBadge, LastRefreshed, RefreshButton, Dashboard)
├─ specs/001-market-sentiment-score/        (spec, plan, research, data-model, quickstart, tasks, HANDOFF, contracts/, checklists/)
├─ package.json, pnpm-workspace.yaml        (backend + frontend + scripts/tradingview-sidecar)
├─ tsconfig.base.json, .eslintrc.cjs, .prettierrc.json, .editorconfig, .nvmrc
├─ .gitignore, README.md, CLAUDE.md
```

Nothing exists in `node_modules`, `.wrangler`, `.vercel`, or any build output.

## 6. Environment that is NOT provisioned

| Need | Where | Notes |
| ---- | ----- | ----- |
| pnpm workspace deps | locally + CI | `pnpm install` (not run locally per owner pref; CI runs it automatically) |
| Vercel CLI auth | local `vercel login` | Opens browser OAuth — ask first |
| Vercel project link | `cd scripts/tradingview-sidecar && vercel link` | Binds to a Vercel project |
| Sidecar deploy | `vercel --prod` from `scripts/tradingview-sidecar/` | Prints the sidecar URL (e.g. `https://tradingview-sidecar.vercel.app`) |
| Cloudflare Wrangler auth | local `npx wrangler login` | Opens browser OAuth — ask first |
| D1 database (remote) | `npx wrangler d1 create market-sentiment` | Paste returned `database_id` into `backend/wrangler.toml` |
| D1 migrations (remote) | `pnpm -F @market-sentiment/backend db:migrate` | Needs login + DB id |
| **`TRADINGVIEW_SIDECAR_URL` secret** | `npx wrangler secret put TRADINGVIEW_SIDECAR_URL` | The `https://…vercel.app` URL from the sidecar deploy |
| Worker deploy | `pnpm -F @market-sentiment/backend deploy` | Produces `https://market-sentiment-api.<account>.workers.dev` |
| Threshold overrides (optional) | `wrangler secret put VIX_THRESHOLD` etc. | Defaults already set in `wrangler.toml [vars]` |
| Frontend build | `pnpm -F @market-sentiment/frontend build` | Output → `frontend/dist/` |
| Pages deploy | Cloudflare dashboard (link the repo) or `wrangler pages deploy frontend/dist` | Owner choice |

**Ordering note:** deploy the sidecar **first** so you have its URL to plug into `TRADINGVIEW_SIDECAR_URL` before deploying the Worker.

**Prerequisite check on the new Mac:**

```
node --version            # want >= 20 (see .nvmrc)
pnpm --version            # want 9.12.0 (packageManager field)
gh auth status            # should show omer815 as Active
git remote -v             # origin → github.com/omer815/market-sentiment-score
```

If any of those fail, fix them *before* running workspace commands.

## 7. How the next session should start

1. Read **`HANDOFF.md`** (this file), `spec.md`, `tasks.md` headers. ~3 min.
2. Confirm the owner's goal. Likely candidates:
   - (a) **Deploy** to Vercel + Cloudflare and see a first live `/refresh` snapshot (requires running commands — **ask first**).
   - (b) **US2 re-plan** — pick a scheduler and land the 30-min cadence.
   - (c) **US3 history** — range picker + chart.
   - (d) **Hardening** — Playwright E2E, axe, Lighthouse, Workers Analytics Engine.
3. **Respect the "no Mac processes" rule.** When in doubt, write code and ask.
4. **When committing:** commit on `001-market-sentiment-score`, fast-forward `main`, push both.

## 8. Known gotchas & reminders

- **TradingView package is unofficial.** `@mathieuc/tradingview` is reverse-engineered. Field names (`lp`, `periods[*].close`) are stable at write-time but not documented. If the first live `/refresh` returns `Symbol not found`, try `TVC:VIX` / `SP:SPX` / bare `S5FI`.
- **Vercel cold start** on a Hobby function is ~1 s; worst-case end-to-end `/refresh` is ~6 s. The UI shows a busy state so this is honest.
- **Vercel Hobby per-invocation cap: 10 s.** Tight but enough for 3 parallel TradingView resolves.
- **ESLint rule** (override for `frontend/src/components/**`): forbids any `JSXText` matching `/[A-Za-z]/`. All user-facing strings in components must flow through `frontend/src/lib/copy.ts`. Pages and `App.tsx` are exempt.
- **strict TS** with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Index accesses return `T | undefined`; use `!` sparingly.
- **Drizzle + D1** dedup: `onConflictDoNothing({ target: snapshots.slotTs })` on snapshots; readings use the composite PK `(slot_ts, source_id)`.
- **S&P 500 daily fetcher** strips any bar within the last 12 h (today's unfinished candle).
- **Dashboard auto-trigger** is guarded with a `useRef` so React StrictMode's double-mount doesn't fire two `/refresh` calls.
- **Two `gh` accounts** logged in: `omermircor` and `omer815`. Always check `gh auth status` — work under `omer815`.
- **Integration tests are scaffolded, not running.** See `backend/tests/integration/README.md`: they need the Miniflare + Workers Vitest pool wired up once the owner lifts the no-local-processes rule.
- **"Stale" badge was removed** for MVP (see clarification Q3). `StaleBadge.tsx` was deleted; `<LastRefreshed>` renders the age instead.

## 9. Open questions for the next session

1. **First live verification.** Deploy sidecar to Vercel, then Worker to Cloudflare, then `curl -X POST https://…/api/snapshots/refresh`. If TradingView symbols fail, try alternatives (§8).
2. **US2 scheduler choice.** Workers native WebSocket rewrite? GH Actions calling `/refresh`? Hosted cron service? The answer changes what tasks `T091–T098` look like.
3. **Observability priority.** Workers Analytics Engine counters (`refresh.success{source}`, `refresh.failure{source, reason}`, `refresh.duration_ms`) are free but need code writes. Add before US2 or later?
4. **Cloudflare Containers** are newly GA — could eliminate the Vercel sidecar entirely once their free tier is clear. Revisit post-MVP.

## 10. How to refresh this handoff

After any meaningful session:

- Update **Section 2** (what's done vs. not).
- Update **Section 5** if files are added/removed.
- Update **Section 6** if any command is now "done".
- Append to **Section 9** when new questions surface.
- Bump the date at the top.

Keep this file under ~300 lines.
