# Quickstart — Market Sentiment Score Dashboard

**Audience**: A developer picking this feature up for the first time.
**Goal**: local dev loop running in under 10 minutes; deploy to free-tier
Cloudflare in under 20.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 LTS | `nvm install 20` |
| pnpm | ≥ 9 | `corepack enable && corepack prepare pnpm@9 --activate` |
| Wrangler | ≥ 3.80 | `pnpm add -g wrangler` |
| A free Cloudflare account | — | https://dash.cloudflare.com/sign-up |

No paid services. No API keys required (Yahoo Finance and CNN dataviz
endpoints are unauthenticated).

---

## Local dev loop

```bash
# one-time
git checkout 001-market-sentiment-score
pnpm install                                  # installs backend + frontend
pnpm --filter backend db:migrate:local        # creates a local D1 SQLite file

# in two terminals
pnpm --filter backend dev                     # wrangler dev → http://localhost:8787
pnpm --filter frontend dev                    # vite dev    → http://localhost:5173
```

Trigger a cron cycle manually (instead of waiting 30 min):

```bash
curl -X POST "http://localhost:8787/__scheduled?cron=0%2030%20*%20*%20*"
```

Then reload `http://localhost:5173` — you should see the current composite
score and all four source panels.

---

## Run tests

```bash
pnpm -r test:unit           # Vitest, pure functions
pnpm -r test:integration    # Miniflare + local D1 + mocked fetchers
pnpm --filter frontend test:e2e   # Playwright against Vite preview
pnpm -r typecheck
pnpm -r lint
```

Coverage gate (≥ 80 % line + branch) runs in CI; locally with
`pnpm -r test:unit -- --coverage`.

---

## First deploy (from a fresh Cloudflare account)

```bash
# 1. log in
wrangler login

# 2. create the D1 database
wrangler d1 create market-sentiment
# copy the database_id output into backend/wrangler.toml [[d1_databases]]

# 3. apply migrations
pnpm --filter backend db:migrate

# 4. deploy the Worker
pnpm --filter backend deploy
# note the workers.dev URL printed

# 5. point the frontend at it
echo "VITE_API_BASE_URL=https://market-sentiment-api.<your-subdomain>.workers.dev" \
  > frontend/.env.production

# 6. deploy the frontend to Cloudflare Pages
pnpm --filter frontend build
wrangler pages deploy frontend/dist --project-name market-sentiment
```

After step 4 the cron trigger is already active. Within 30 min the first
snapshot lands in D1 and the site starts showing data. To backfill
immediately, trigger the scheduled handler manually from the Cloudflare
dashboard → Workers → your worker → Triggers → "Trigger scheduled".

---

## Verifying the feature against the spec

Map the three user stories to quick manual checks:

| User Story | How to verify |
|---|---|
| **US1** — current score at a glance | Open `/`; within 5 s you see composite heatmap bar (red → green), the numeric score (one of 0/25/50/75/100), the text label ("Neutral", "Lean buy", etc.), and a scoring breakdown panel with one ✓/✗ row per flag (VIX>30, F&G<20, S5FI<20, ≥3 red days). SC-001 + FR-016 + FR-017. |
| **US2** — auto-refresh + persistence | Leave `/` open across a slot boundary (`:00` or `:30`). Within 60 s of the new slot, the composite updates without reload. Query D1: `SELECT count(*) FROM snapshots;` — matches the elapsed slots. SC-002, SC-003. |
| **US3** — historical trend | Go to `/history`, pick "Last 7 days". Chart renders in < 3 s with composite + source lines; failure gaps show as broken segments. SC-004. |

---

## Troubleshooting

- **Cron doesn't fire locally**: Miniflare serves the `/__scheduled` trigger
  endpoint — use the curl command above to force a cycle.
- **CNN F&G returns 403**: make sure the fetcher sends
  `User-Agent: Mozilla/5.0 ...` and `Accept: application/json`. See
  `backend/src/fetchers/cnn-fg.ts`.
- **Yahoo returns 429**: back off for the current cycle; the snapshot will
  be recorded as `partial`. A second missed cycle in a row triggers the
  stale-banner on the dashboard.
- **D1 migration conflict**: `wrangler d1 migrations list` to inspect; for
  local dev you can wipe with `rm -rf backend/.wrangler/state/v3/d1`.

---

## Where to edit what

- **Change a scoring threshold** (e.g., VIX > 30 → > 28) → set the
  corresponding env var (`VIX_THRESHOLD`, `FG_THRESHOLD`,
  `S5FI_THRESHOLD`, `SP500_RED_DAYS_MIN`) via `wrangler secret put` — no
  code change.
- **Change a flag rule shape** (e.g., operator `<` → `<=`) →
  `backend/src/scoring/flags.ts` (+ `tests/unit/flags.test.ts`).
- **Add a fifth source** → new file under `backend/src/fetchers/`, add to
  `source_metadata` seed migration, update `SourceId` enum in
  `contracts/openapi.yaml`, regenerate the typed client.
- **Tune the composite weights** → `backend/src/config.ts` (runtime env
  vars override).
- **Add a new historical resolution** → extend the SQL branch in
  `backend/src/storage/snapshots.ts` + the `resolution` enum in
  `openapi.yaml`.
- **Change a UI string** → `frontend/src/lib/copy.ts` — never inline.
