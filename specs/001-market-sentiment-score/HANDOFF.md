# Session Handoff — Market Sentiment Score

**Written:** 2026-04-23 (updated later the same day with the TradingView / GH Actions cron switch) · **Owner:** omer (GitHub: `omer815`) · **Status:** MVP written, nothing deployed

This document is the single-read briefing for whoever (human or AI) picks up
this project in a new session / on a new machine. If something here
conflicts with anything else in the repo, **this document wins for
short-term state; `spec.md` wins for product requirements**.

---

## 1. Where everything lives

- **GitHub repo:** https://github.com/omer815/market-sentiment-score (public)
  - `main` — tracks the MVP commit
  - `001-market-sentiment-score` — same tip as `main` (feature branch)
  - Both push to the same remote; `main` is always fast-forwarded from the feature branch.
- **Default feature directory:** `specs/001-market-sentiment-score/`
  - Persisted in `.specify/feature.json` — downstream `/speckit.*` commands read from there, not from the git branch name.
- **Primary docs to open first** (in this order):
  1. This file (`HANDOFF.md`) — current state
  2. `spec.md` — product + the "Implementation Status" table at the top
  3. `plan.md` — tech stack and structure
  4. `tasks.md` — 104-task backlog (T001…T063 have source code; T064…T104 are not implemented)
  5. `data-model.md`, `contracts/openapi.yaml`, `contracts/ui-contract.md`, `research.md`, `quickstart.md`

## 2. What is done vs. what is not

**Done (MVP = User Story 1 — "See the current buy/sell score at a glance"):**

- Specs, plan, research, data model, OpenAPI + UI contracts, quickstart, 104-task breakdown
- Constitution v1.0.0 (`.specify/memory/constitution.md`)
- **Cron runner (new workspace `scripts/cron/`)**: runs in Node on a GitHub Actions schedule (`0,30 * * * *`). Uses the `@mathieuc/tradingview` npm package (added manually to `package.json`, **not** installed locally) to pull VIX / S&P 500 daily / S5FI, and CNN's dataviz JSON endpoint for Fear & Greed. Computes the four flags + composite and POSTs to `/api/cron/ingest` on the Worker.
- **Backend (Cloudflare Worker, read + ingest only)**: Hono router with `/api/health`, `/api/sources`, `/api/sources/:id`, `/api/snapshots`, `/api/snapshots/latest`, and the unauthenticated `POST /api/cron/ingest`. Drizzle + D1 schema + 2 migrations. **No fetchers in the Worker anymore** — the live-data fetch path lives entirely in `scripts/cron/`. The Worker's `scheduled` handler is intentionally not exported (the 30-min cadence is GH Actions, not Cloudflare cron).
- Backend unit tests: slot rounding, flags, composite (the Worker still owns the scoring code as a second independent copy — drift between the two is guarded by these tests plus the parallel scoring file in `scripts/cron/src/scoring.ts`).
- Frontend source (React + Vite + TanStack Query): heatmap, scoring breakdown, flag rows, empty/error/stale/partial state components, auto-refresh dashboard.
- Design tokens + copy catalogue (enforced by ESLint: no hard-coded text in `frontend/src/components/**`).
- GitHub Actions CI (`typecheck` + `lint` + unit tests) plus the new `cron.yml` scheduler.

**Not done (deliberately, awaiting next session):**

- **Nothing has ever been installed or executed.** No `pnpm install`, no `wrangler`, no dev server, no D1 database, no deploy. The owner explicitly asked to keep the Mac quiet — **do not start any local processes without asking first.**
- User Story 2 (auto-refresh + persistence beyond MVP) is scaffolded in routes but **not operationally verified**.
- User Story 3 (historical charts, S&P 500 30-min candle chart, range picker): **not built**.
- Polish phase: Playwright E2E, axe accessibility tests, Lighthouse budgets, bundlewatch, Workers Analytics Engine observability, alerting — **not built**.
- Deployment to Cloudflare (D1 create, migrations applied remotely, Worker deploy, Pages deploy): **not done**.

See `spec.md` → "Implementation Status" table for the canonical checklist.

## 3. Strict owner preferences (durable — apply in every session)

These are non-obvious and have been stated explicitly by the owner. Treat
them as standing instructions, not one-shot requests:

1. **Keep the Mac quiet.** Do not run `pnpm install`, `npm install`,
   `wrangler`, `vite`, `vitest`, or any dev server without asking first.
   Writing source files is fine. This was stated verbatim as "I want avoid
   to run runing progrems on mac".
2. **Source-only until the owner says otherwise.** "Do not run any npm,
   wanglerr, or install commands, Just Create all code untill the MVP ok?"
   Even post-MVP, ask before any command with network or runtime side effects.
3. **Public GitHub repo under `omer815`** — not `omermircor`. The `gh` CLI is
   already configured (`gh auth switch --user omer815`, `gh auth setup-git`).
   The remote `origin` points to `https://github.com/omer815/market-sentiment-score.git`.
4. **Two-branch workflow:** feature branch `001-market-sentiment-score` is
   where work lands; `main` is fast-forwarded to match, then both are
   pushed together. Do not open PRs between them (the owner keeps them
   identical on purpose).
5. **Commit style:** `<type>: <summary>` header (e.g. `feat:`, `docs:`),
   detailed body, and the `Co-Authored-By: Claude …` trailer (see existing
   commits `833a1f7` and `9b3c541`).
6. **Language:** the owner types fast and sometimes drops articles; do not
   ask them to restate — infer and confirm.

## 4. Locked product decisions (do NOT re-open without a clarify prompt)

- **Hosting:** Cloudflare free tier — Workers (read API + ingest endpoint),
  D1 (SQLite), Pages (SPA). Not Vercel, not Fly, not Supabase.
- **Cron:** runs as a **GitHub Actions workflow** (`.github/workflows/cron.yml`)
  on `0,30 * * * *` UTC, **not** as a Cloudflare Worker `scheduled` handler.
  Rationale: the TradingView npm package (`@mathieuc/tradingview`) opens raw
  WebSockets via Node `net`/`tls` — not compatible with Workers even with
  `nodejs_compat`. GH Actions runners are full Node envs where the package
  works, so the cron pulls data there and POSTs to the Worker.
- **Data providers:** TradingView via `@mathieuc/tradingview` for VIX
  (`CBOE:VIX`), S&P 500 daily (`CBOE:SPX`, timeframe `D`), and S5FI
  (`INDEX:S5FI`). CNN Fear & Greed still comes from
  `https://production.dataviz.cnn.io/index/fearandgreed/graphdata` (CNN's
  own dataviz JSON — TradingView doesn't carry F&G). Yahoo Finance
  endpoints are **no longer used**; the old `backend/src/fetchers/*` files
  and `backend/src/cron.ts` were deleted.
- **Cron cadence:** `0,30 * * * *` UTC — clock-aligned to `:00` and `:30`.
  GH Actions schedule is best-effort (can drift 5–15 min under load); the
  cron runner rounds to the nearest 30-min slot via `currentSlot()`, and
  the ingest endpoint dedups by D1 primary key on `slot_ts`, so drift is
  harmless.
- **Auth on ingest:** none. `POST /api/cron/ingest` is intentionally open
  in v1 — writes are idempotent on `slot_ts` (D1 primary key) and validated
  by Zod + D1 CHECK constraints, so a duplicate or malformed submission is
  rejected or dedup'd. Anyone on the internet can POST a snapshot; this is
  an accepted trade-off for v1 simplicity. Only `WORKER_URL` needs to be
  set as a GH Actions secret.
- **Scoring (see `spec.md` FR-005):** four binary flags × 25 points, so
  composite ∈ `{0, 25, 50, 75, 100}`.
  - VIX > 30
  - CNN Fear & Greed < 20
  - S5FI < 20
  - S&P 500 has ≥ 3 consecutive red daily closes (longer streaks also trigger)
  - A failed fetch contributes 0 points and flags the snapshot `partial`.
- **Thresholds are env vars**, not constants, so they can be re-tuned with
  `wrangler secret put` (names: `VIX_THRESHOLD`, `FG_THRESHOLD`,
  `S5FI_THRESHOLD`, `SP500_RED_DAYS_MIN`).
- **Display:** red-to-green heatmap with 5 discrete stops (0 red → 100 green),
  plus per-flag breakdown rows. Color must not be the only state signal —
  numeric value + text label + ✓/✗ are required for WCAG AA.
- **Auth:** public, no accounts, no allow-list, no CAPTCHA in v1.
- **Partial snapshots:** never carry forward stale values into the composite.
- **CNN F&G source:** use CNN's own dataviz JSON endpoint
  (`https://production.dataviz.cnn.io/index/fearandgreed/graphdata`). If it
  breaks, the fallback is scraping the public CNN F&G page — not a paid API.

## 5. Repo state snapshot

```
dashboard/
├─ .claude/skills/speckit-git-*/…           (Spec Kit git extension)
├─ .github/workflows/
│  ├─ ci.yml                                (typecheck + lint + unit tests on push/PR)
│  └─ cron.yml                              (NEW — every 30 min: runs scripts/cron)
├─ .specify/                                (Spec Kit state — constitution, extensions, feature.json)
├─ scripts/cron/                            (NEW Node workspace — runs in GH Actions)
│  ├─ package.json                          (@market-sentiment/cron — @mathieuc/tradingview, zod, tsx)
│  ├─ tsconfig.json
│  └─ src/
│     ├─ run.ts                             (entrypoint: fetch → score → POST)
│     ├─ tradingview.ts                     (promise wrapper over the WebSocket package)
│     ├─ slot.ts                            (clock-aligned 30-min slot rounding)
│     ├─ scoring.ts                         (flags + composite — duplicated from backend)
│     ├─ types.ts                           (SourceId, FetchResult<T>, payload types)
│     ├─ fetchers/{vix,s5fi,sp500-daily,cnn-fg}.ts
│     └─ post.ts                            (POST /api/cron/ingest — unauthenticated)
├─ backend/                                 (Cloudflare Worker — read + ingest ONLY)
│  ├─ wrangler.toml                         (cron triggers disabled, D1 binding placeholder)
│  ├─ package.json                          (hono, zod, drizzle, wrangler — no fetchers)
│  ├─ tsconfig.json, vitest.config.ts
│  └─ src/
│     ├─ worker.ts                          (default export { fetch } — NO scheduled handler)
│     ├─ router.ts                          (mounts health/sources/snapshots/cron routes)
│     ├─ env.ts                             (Env interface — DB + threshold vars)
│     ├─ config.ts                          (Zod-parsed ScoringConfig from env)
│     ├─ routes/{health,sources,snapshots,ingest}.ts
│     ├─ fetchers/types.ts                  (ONLY types.ts remains — live fetchers moved to scripts/cron)
│     ├─ scoring/{flags,composite}.ts       (kept for future re-scoring / tests)
│     ├─ storage/{schema,client,snapshots,sources}.ts
│     ├─ storage/migrations/0001_init.sql + 0002_seed_sources.sql
│     └─ lib/{slot,time,errors}.ts
│  └─ tests/unit/{slot,flags,composite}.test.ts
├─ frontend/                                (unchanged)
├─ specs/001-market-sentiment-score/        (spec, plan, research, data-model, quickstart, tasks, HANDOFF, contracts/)
├─ package.json, pnpm-workspace.yaml        (workspaces: backend + frontend + scripts/cron)
├─ tsconfig.base.json, .eslintrc.cjs, .prettierrc.json, .editorconfig, .nvmrc
├─ .gitignore, README.md, CLAUDE.md
```

Nothing exists in `node_modules`, `.wrangler`, or any build output — those
are all untouched.

## 6. Environment that is NOT provisioned

The following are **required** to run anything but have not been done:

| Need | Where | Notes |
| ---- | ----- | ----- |
| pnpm workspace deps | locally + CI | `pnpm install` (not run locally per owner pref; GH Actions runs it automatically) |
| Cloudflare Wrangler auth | local `npx wrangler login` | Opens browser OAuth — ask first |
| D1 database (remote) | `npx wrangler d1 create market-sentiment` | Paste returned `database_id` into `backend/wrangler.toml` (currently `REPLACE_WITH_WRANGLER_D1_CREATE_OUTPUT`) |
| D1 migrations (remote) | `pnpm -F @market-sentiment/backend db:migrate` | Needs login + DB id |
| Worker deploy | `pnpm -F @market-sentiment/backend deploy` | Produces `https://market-sentiment-api.<account>.workers.dev` |
| **`WORKER_URL` on GitHub** | `Settings → Secrets → Actions → WORKER_URL` | Deployed Worker base URL, no trailing slash |
| Threshold env (optional) | `Settings → Secrets → Actions → Variables` | `VIX_THRESHOLD`, `FG_THRESHOLD`, `S5FI_THRESHOLD`, `SP500_RED_DAYS_MIN` — leave unset to use defaults |
| Frontend build | `pnpm -F @market-sentiment/frontend build` | Output → `frontend/dist/` |
| Pages deploy | Cloudflare dashboard (link the repo) or `wrangler pages deploy frontend/dist` | Owner choice |

**Once the above is done, nothing else needs to run locally** — the GH
Actions cron pushes snapshots automatically every 30 min.

**Prerequisite check on the new Mac:**

```
node --version            # want >= 20 (see .nvmrc)
pnpm --version            # want 9.12.0 (packageManager field)
gh auth status            # should show omer815 as Active
git remote -v             # origin → github.com/omer815/market-sentiment-score
```

If any of those fail, fix them *before* running workspace commands.

## 7. How the next session should start

1. **Read the headers of these files in order:** `HANDOFF.md` (this file),
   `spec.md`, `tasks.md`. That gives you the full picture in ~3 minutes.
2. **Confirm the owner's goal for this session.** Likely candidates:
   - (a) Deploy to Cloudflare and see a first live snapshot (requires
     running commands — *ask first*).
   - (b) Continue building User Story 2 (durable history view, auto-refresh
     verification) — more source code, still no runs.
   - (c) Continue building User Story 3 (historical chart, S&P 500 candle
     chart) — more source code, still no runs.
   - (d) Hardening: add Playwright E2E, axe a11y tests, Lighthouse budgets.
3. **Respect the "no Mac processes" rule** unless the owner explicitly lifts
   it for this session. When in doubt, write code and ask.
4. **When committing:** commit on `001-market-sentiment-score`, fast-forward
   `main`, push both. Use the commit style already in the log.

## 8. Known gotchas & reminders

- **TradingView package is unofficial.** `@mathieuc/tradingview` is a
  reverse-engineered WebSocket client for TradingView's public chart
  protocol. Field names (`lp`, `periods[*].close`, etc.) are stable at
  write-time but not documented; if a symbol lookup or a field returns
  wrong/no data on the first GH Actions run, check the wrapper in
  `scripts/cron/src/tradingview.ts` first.
- **TradingView symbols** used: `CBOE:VIX`, `CBOE:SPX`, `INDEX:S5FI`.
  If any of these resolve to `Symbol not found`, try alternatives:
  `TVC:VIX` / `SP:SPX` / `INDEX:S5FI` (or omit the prefix). The TV
  package sometimes wants bare symbols.
- **Cron drift.** GH Actions scheduled runs can lag by 5–15 min under
  heavy load. `scripts/cron/src/slot.ts` rounds to the nearest 30-min
  slot, and D1's PK on `slot_ts` dedups; so a late run writes the right
  slot, and an early manual retry is a no-op.
- **GH Actions shuts down scheduled workflows** after 60 days of zero
  repo activity (pushes, PRs, etc.). A once-a-month commit keeps it alive.
- **ESLint rule** (`.eslintrc.cjs`, override for `frontend/src/components/**`):
  forbids any `JSXText` matching `/[A-Za-z]/`. All user-facing strings in
  components must flow through `frontend/src/lib/copy.ts`. Pages (`pages/`)
  and the top-level `App.tsx` are exempt.
- **strict TS** with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
  Index accesses (`arr[i]`) return `T | undefined`. Use non-null assertion
  (`!`) only when the bound check is obvious and local.
- **Drizzle + D1:** `onConflictDoNothing({ target: snapshots.slotTs })` is
  how the cron dedups. Readings use `onConflictDoNothing()` on the
  composite PK `(slot_ts, source_id)`.
- **`latestDate` from `parseDaily`:** uses `toISOString().slice(0, 10)` —
  already UTC, matches Yahoo's timestamps.
- **S&P 500 daily fetcher** strips any bar whose timestamp is within the
  last 12 hours so we never score on today's unfinished bar.
- **Duplicate account in `gh`:** both `omermircor` and `omer815` are logged
  in. Always check `gh auth status` before creating GitHub resources; the
  owner wants work under `omer815`.
- **Free-tier constraints:** do not add any dependency that needs a paid
  plan. No Vercel, no Sentry paid tier, no paid market-data APIs. CNN F&G
  via dataviz JSON is acceptable; if blocked, the fallback is a scrape.
- **Owner's typing style:** "wanglerr" = `wrangler`, "C5FI" = `S5FI`,
  "3 days read" = 3 red days. Interpret kindly and move on.

## 9. Open questions for the next session

(These were not decided in the previous session and will need a direct
answer from the owner before they can be acted on.)

1. **First live verification.** Before the whole thing is trusted, the
   GH Actions cron needs to run once successfully (TradingView symbols +
   CNN endpoint all resolve; Worker accepts the ingest). Best path:
   trigger `workflow_dispatch` manually from the Actions tab once all
   secrets are set.
2. For User Story 3's S&P 500 candle chart, stick with `lightweight-charts`
   (locked in `plan.md`) or switch to something simpler given we only need
   30-min bars? (Script already fetches daily candles for scoring; a
   30-min fetcher is not yet written.)
3. Observability: Workers Analytics Engine is free but requires code
   writes from the Worker. Acceptable to add before US2/US3 ship?
4. If TradingView ToS becomes a concern later, fallback is Yahoo Finance
   (the deleted `backend/src/fetchers/*` are in git history at commit
   `9b3c541` and can be restored in ~5 min).

## 10. How to refresh this handoff

After any meaningful session:

- Update **Section 2** (what's done vs. not).
- Update **Section 5** if files are added/removed.
- Update **Section 6** if any command is now "done" (strike-through or
  move to "provisioned").
- Append to **Section 9** when new questions surface.
- Bump the date at the top.

Keep this file under ~250 lines so it stays cheap to load at the start of
every session.
