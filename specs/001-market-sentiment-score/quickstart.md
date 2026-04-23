# Quickstart — Market Sentiment Score Dashboard

**Audience**: a developer picking this feature up for the first time.
**Goal**: local dev loop running in under 10 minutes; deploy to free-tier
Cloudflare + Vercel in under 25.

---

## Architecture at a glance

```
caller (curl or the dashboard's Refresh button)
   │
   ▼
POST /api/snapshots/refresh           Cloudflare Worker (backend/)
   │
   ├─► HTTPS → production.dataviz.cnn.io/…graphdata       (CNN F&G)
   └─► HTTPS → ${TRADINGVIEW_SIDECAR_URL}/fetch           (Vercel Node fn)
                                                          └─► @mathieuc/tradingview → TradingView WS
   │
   ▼
score + insertSnapshot (idempotent on 30-min slot_ts, D1 PK)
   │
   ▼
201 Snapshot | 200 {slot_ts, inserted: false, snapshot}
```

No scheduled cron in MVP — the user decides when to refresh.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 LTS | `nvm install 20` (`.nvmrc` pins `20`) |
| pnpm | 9.12.0 | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| Wrangler | ≥ 3.80 | `pnpm add -g wrangler` — or use `pnpm dlx wrangler` |
| Vercel CLI | ≥ 39 | `pnpm add -g vercel` — or use `pnpm dlx vercel` |
| A free Cloudflare account | — | https://dash.cloudflare.com/sign-up |
| A free Vercel account | — | https://vercel.com/signup |

No paid services. No API keys. CNN and TradingView are both free at the
volumes we use.

---

## Local dev loop

```bash
git checkout 001-market-sentiment-score
pnpm install                                  # installs all three workspaces

# Terminal 1 — backend Worker
pnpm --filter @market-sentiment/backend db:migrate:local
pnpm --filter @market-sentiment/backend dev    # wrangler dev → http://localhost:8787

# Terminal 2 — sidecar (the only way to fetch TradingView locally)
pnpm --filter @market-sentiment/tradingview-sidecar dev
# vercel dev → http://localhost:3000

# Terminal 3 — frontend
pnpm --filter @market-sentiment/frontend dev   # vite → http://localhost:5173
```

Point the Worker at the local sidecar:

```bash
# backend/.dev.vars
TRADINGVIEW_SIDECAR_URL=http://localhost:3000
```

Trigger a refresh manually:

```bash
curl -X POST http://localhost:8787/api/snapshots/refresh
# → 201 with the fresh Snapshot
# subsequent calls within the same 30-min slot return 200 inserted:false
```

Then reload `http://localhost:5173` — the dashboard shows the current
composite score and per-flag breakdown.

---

## Run tests

```bash
pnpm -r test:unit           # Vitest, pure functions (scoring, slot, parsers)
pnpm -r test:integration    # Miniflare + local D1 + mocked CNN + mocked sidecar
pnpm -r typecheck
pnpm -r lint
```

Coverage gate (≥ 80 % line + branch) runs in CI; locally with
`pnpm -r test:unit -- --coverage`.

E2E (post-MVP) will be: `pnpm --filter @market-sentiment/frontend test:e2e`.

---

## First deploy (from a fresh Cloudflare + Vercel account)

```bash
# ─────────────────────────────────────────────────────────
# 1. Sidecar (Vercel) — deploy first so we have its URL
# ─────────────────────────────────────────────────────────
cd scripts/tradingview-sidecar
vercel login
vercel link                                   # one-time; binds to a Vercel project
vercel --prod
# → note the printed URL, e.g. https://tradingview-sidecar.vercel.app

# ─────────────────────────────────────────────────────────
# 2. D1 (Cloudflare) — create + apply migrations
# ─────────────────────────────────────────────────────────
cd ../../backend
wrangler login
wrangler d1 create market-sentiment
# copy the printed database_id into backend/wrangler.toml [[d1_databases]]
pnpm db:migrate                               # apply migrations to remote D1

# ─────────────────────────────────────────────────────────
# 3. Worker (Cloudflare) — set sidecar URL + deploy
# ─────────────────────────────────────────────────────────
wrangler secret put TRADINGVIEW_SIDECAR_URL
# paste the Vercel URL from step 1
pnpm deploy                                   # → https://market-sentiment-api.<you>.workers.dev

# ─────────────────────────────────────────────────────────
# 4. Frontend (Cloudflare Pages) — build + deploy
# ─────────────────────────────────────────────────────────
cd ../frontend
echo "VITE_API_BASE_URL=https://market-sentiment-api.<you>.workers.dev" \
  > .env.production
pnpm build
wrangler pages deploy dist --project-name market-sentiment

# ─────────────────────────────────────────────────────────
# 5. First snapshot — trigger the refresh endpoint
# ─────────────────────────────────────────────────────────
curl -X POST https://market-sentiment-api.<you>.workers.dev/api/snapshots/refresh
# → 201 with the first Snapshot row
```

Within a second or two of step 5, the dashboard at the Pages URL shows
data. Subsequent `/refresh` calls during the same 30-min slot return the
existing row (idempotent).

---

## Verifying the feature against the spec

Map User Story 1 to manual checks (US2 and US3 are post-MVP):

| Check | How to verify |
|---|---|
| **US1 — current score at a glance** (SC-001, FR-016, FR-017) | Open `/`; within 5 s after the first `/refresh` you see the composite heatmap bar (red → green), the numeric score (one of 0/25/50/75/100), the text label ("Neutral", "Lean buy", etc.), and a scoring breakdown panel with one ✓/✗ row per flag (VIX>30, F&G<20, S5FI<20, ≥3 red days). |
| **Partial rendering** (FR-012, AS1.2) | Break one source in local dev (rename the symbol in `scripts/tradingview-sidecar/src/fetchers/vix.ts` to `CBOE:NOT_A_SYMBOL`), hit `/refresh`. The dashboard shows a partial composite, flags the snapshot, and the VIX row is in "not evaluated" state. |
| **Idempotent refresh** (FR-008) | Call `/refresh` twice within the same 30-min window. First returns 201, second returns 200 `{inserted: false}` with the same `slot_ts`. D1 `SELECT COUNT(*) FROM snapshots WHERE slot_ts = ?` returns 1. |

---

## Troubleshooting

- **Sidecar returns 502 / times out**: the TradingView WebSocket is
  flaky in the first minute after a cold start. Vercel's p95 cold-start
  is ~1 s but can spike. Retry the `/refresh` call once.
- **CNN F&G returns 403**: verify the fetcher sends
  `User-Agent: Mozilla/5.0 …` and `Accept: application/json`. See
  `backend/src/fetchers/cnn-fg.ts`.
- **`wrangler d1 migrations apply` errors with "no such table"**: the
  remote DB wasn't created yet — run step 2 before step 3.
- **Dashboard stays empty forever**: the first `/refresh` hasn't run.
  Call it once via `curl`; then the dashboard polls and picks it up
  within 30 s.
- **Local Wrangler says `TRADINGVIEW_SIDECAR_URL` is undefined**: make
  sure `backend/.dev.vars` exists (it's `.gitignore`d) with the local
  sidecar URL.

---

## Where to edit what

| Intent | File |
|---|---|
| Change a scoring threshold (e.g. VIX > 30 → > 28) | `wrangler secret put VIX_THRESHOLD` — no code change. (Also `FG_THRESHOLD`, `S5FI_THRESHOLD`, `SP500_RED_DAYS_MIN`.) |
| Change a flag rule shape (e.g. operator `<` → `<=`) | `backend/src/scoring/flags.ts` (+ `tests/unit/flags.test.ts`). |
| Swap a TradingView symbol | `scripts/tradingview-sidecar/src/fetchers/{vix,sp500-daily,s5fi}.ts`. |
| Move CNN F&G to a different upstream | `backend/src/fetchers/cnn-fg.ts`. |
| Add a fifth source | (i) fetcher under `backend/src/fetchers/` or new symbol in the sidecar, (ii) row in `source_metadata` seed migration, (iii) extend `SourceId` enum in `contracts/openapi.yaml`, (iv) update `orchestrator.ts`. |
| Change a UI string | `frontend/src/lib/copy.ts` — never inline (ESLint rule enforces). |
| Re-add automatic refresh (US2 work) | `backend/src/worker.ts` (re-add a `scheduled` handler calling the orchestrator) + `wrangler.toml` `[triggers]` block. |
