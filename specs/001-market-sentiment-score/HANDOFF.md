# Session Handoff — Market Sentiment Score

**Written:** 2026-04-23 · **Owner:** omer (GitHub: `omer815`) · **Status:** MVP written, nothing deployed

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
- Backend source (Cloudflare Workers + Hono + Drizzle): fetchers (VIX, CNN F&G, S5FI, S&P 500 daily + intraday), scoring flags + composite, D1 schema + 2 migrations, routes, cron handler, worker entrypoint
- Backend unit tests: slot rounding, flags, composite, S&P 500 daily parsing
- Frontend source (React + Vite + TanStack Query): heatmap, scoring breakdown, flag rows, empty/error/stale/partial state components, auto-refresh dashboard
- Design tokens + copy catalogue (enforced by ESLint: no hard-coded text in `frontend/src/components/**`)
- GitHub Actions CI (`typecheck` + `lint` + unit tests)

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

- **Hosting:** Cloudflare free tier — Workers (API + cron), D1 (SQLite),
  Pages (SPA). No always-on VM. Not Vercel, not Fly, not Supabase.
- **Cron cadence:** `0,30 * * * *` UTC — clock-aligned to `:00` and `:30`.
  Snapshots are keyed by the scheduled slot, not wall-clock fetch time,
  so retries do not duplicate rows.
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

## 5. Repo state snapshot (commit `9b3c541`)

```
dashboard/
├─ .claude/skills/speckit-git-*/…          (Spec Kit git extension)
├─ .github/workflows/ci.yml                 (typecheck + lint + unit tests)
├─ .specify/
│  ├─ memory/constitution.md                (v1.0.0 — Code Quality, Testing, UX, Perf)
│  ├─ extensions.yml, extensions/git/…      (Spec Kit git extension config)
│  ├─ feature.json                          ({"feature_directory":"specs/001-market-sentiment-score"})
│  └─ scripts/bash/*.sh                     (Spec Kit helpers — already executable)
├─ backend/
│  ├─ wrangler.toml                         (name=market-sentiment-api, cron, D1 binding placeholder, vars)
│  ├─ package.json                          (@market-sentiment/backend — hono, zod, drizzle, wrangler)
│  ├─ tsconfig.json, vitest.config.ts
│  └─ src/
│     ├─ worker.ts                          (default export { fetch, scheduled })
│     ├─ router.ts                          (Hono app + CORS)
│     ├─ cron.ts                            (fetch → flag → composite → persist)
│     ├─ env.ts                             (Env interface for Workers bindings)
│     ├─ config.ts                          (Zod-parsed ScoringConfig from env)
│     ├─ routes/{health,sources,snapshots}.ts
│     ├─ fetchers/{vix,cnn-fg,s5fi,sp500-daily,sp500-intraday,types}.ts
│     ├─ scoring/{flags,composite}.ts
│     ├─ storage/{schema,client,snapshots,sources}.ts
│     ├─ storage/migrations/0001_init.sql + 0002_seed_sources.sql
│     └─ lib/{slot,time,errors}.ts
│  └─ tests/unit/{slot,flags,composite,sp500-daily}.test.ts
├─ frontend/
│  ├─ package.json                          (@market-sentiment/frontend — react, vite, tanstack-query)
│  ├─ tsconfig.json, vite.config.ts, index.html
│  └─ src/
│     ├─ main.tsx, App.tsx, test-setup.ts
│     ├─ pages/Dashboard.tsx                (MVP page — US1)
│     ├─ components/{CompositeHeatmap,FlagRow,ScoringBreakdown,EmptyState,ErrorState,PartialBadge,StaleBadge}.tsx
│     ├─ lib/{api,api-types,copy,heatmap}.ts
│     └─ styles/{tokens,global}.css
├─ specs/001-market-sentiment-score/
│  ├─ spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md, HANDOFF.md (this file)
│  ├─ contracts/{openapi.yaml, ui-contract.md}
│  └─ checklists/requirements.md
├─ package.json                             (pnpm workspace root — scripts delegate via `pnpm -r`)
├─ pnpm-workspace.yaml                      (backend + frontend)
├─ tsconfig.base.json                       (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
├─ .eslintrc.cjs                            (strict-type-checked + ban hard-coded JSX text in components/**)
├─ .prettierrc.json, .editorconfig, .nvmrc (Node 20)
├─ .gitignore                               (node_modules, .wrangler, .dev.vars, …)
├─ README.md, CLAUDE.md
```

Nothing exists in `node_modules`, `.wrangler`, or any build output — those
are all untouched.

## 6. Environment that is NOT provisioned

The following are **required** to run anything but have not been done:

| Need | Command | Notes |
| ---- | ------- | ----- |
| pnpm workspace deps | `pnpm install` (from repo root) | Will install ~30 direct deps across both workspaces |
| Cloudflare Wrangler auth | `npx wrangler login` | Opens a browser OAuth flow — ask the owner first |
| D1 database (remote) | `npx wrangler d1 create market-sentiment` | Returns a `database_id` → paste into `backend/wrangler.toml` (currently `REPLACE_WITH_WRANGLER_D1_CREATE_OUTPUT`) |
| D1 migrations (local) | `pnpm -F @market-sentiment/backend db:migrate:local` | Creates `.wrangler/state/…` SQLite file |
| D1 migrations (remote) | `pnpm -F @market-sentiment/backend db:migrate` | Needs login + DB id |
| Worker deploy | `pnpm -F @market-sentiment/backend deploy` | Needs login + D1 id |
| Frontend build | `pnpm -F @market-sentiment/frontend build` | Output → `frontend/dist/` |
| Pages deploy | Via Cloudflare dashboard linking the repo, or `wrangler pages deploy frontend/dist` | Decision owed: dashboard vs. CLI |

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

1. Do we want to actually deploy on Cloudflare now, or keep shipping
   source only and deploy later in one shot?
2. For User Story 3's S&P 500 candle chart, stick with `lightweight-charts`
   (locked in `plan.md`) or switch to something simpler given we only need
   30-min bars? (Current code fetches the data but nothing renders it yet.)
3. Observability: Workers Analytics Engine is free but requires code
   writes from the Worker. Acceptable to add before US2/US3 ship?
4. Is there a preference for where build/test badges should appear on the
   README once CI runs for the first time?

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
