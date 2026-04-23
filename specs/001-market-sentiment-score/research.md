# Phase 0 — Research & Decisions

**Feature**: Market Sentiment Score Dashboard (`001-market-sentiment-score`)
**Date**: 2026-04-23
**Input constraints** (from spec Clarifications + Assumptions):
- Free-tier cloud / serverless only (no paid tier, no always-on VM)
- Public site, no authentication
- 30-min cadence, clock-aligned to `:00` / `:30` UTC
- Partial composite rule: exclude failed sources, flag `partial`

All "NEEDS CLARIFICATION" items from the spec phase are resolved. Below are
the remaining technical decisions needed for design.

---

## Amendment — 2026-04-23 (same day)

After the initial research, two decisions were revised:

### A. Cron moved from Cloudflare Workers to GitHub Actions

**Revised decision:** the 30-min cadence runs as a GitHub Actions
scheduled workflow (`.github/workflows/cron.yml`, `0,30 * * * *`), not as
a Cloudflare Worker `scheduled` handler.

**Why the change:** the owner asked to use the `@mathieuc/tradingview`
npm package for market data (see §B below). That package opens raw
WebSockets via Node `net`/`tls` and is **not compatible with Cloudflare
Workers' V8 isolates** even with `nodejs_compat`. GH Actions runners are
full Node environments where the package works.

**New shape:** GH Actions → Node cron runner (`scripts/cron/`) → fetch &
score → `POST /api/cron/ingest` on the Worker (bearer-authenticated via
shared `CRON_SECRET`). D1 remains the source of truth, read via the
existing GET endpoints. The Worker no longer exports `scheduled`.

**Trade-offs accepted:**
- GH Actions scheduled workflows have looser timing (5–15 min drift is
  possible under heavy load) vs. Cloudflare's tight cron. Mitigated by
  rounding to the nearest 30-min slot on ingest and the D1 PK dedup — a
  late tick still persists into the correct slot, and duplicates are
  ignored. Acceptable for "market sentiment every 30 min".
- GH Actions auto-disables scheduled workflows after 60 days of no repo
  activity. Mitigated by the fact that this is an active project; a
  fallback alert can be added later if needed.
- Authentication boundary widens: the Worker now has a write endpoint.
  Mitigated by timing-safe bearer-token check + D1 CHECK constraints on
  every column.

### B. Market data moved from Yahoo Finance to TradingView

**Revised decision:** VIX, S&P 500 daily closes, and S5FI are fetched via
`@mathieuc/tradingview` (unofficial WebSocket client). CNN Fear & Greed
stays on `https://production.dataviz.cnn.io/index/fearandgreed/graphdata`
(TradingView doesn't carry the CNN composite).

**Symbols:** `CBOE:VIX`, `CBOE:SPX` (timeframe `D`), `INDEX:S5FI`.

**Why the change:** owner reported Yahoo's VIX value looked wrong and
asked for TradingView as the source of truth. Trade-off: TradingView's
public chart protocol is unofficial and their ToS forbids automated
access — acceptable for a personal dashboard; would need re-evaluating
for a production/commercial use.

**Fallback:** the Yahoo fetchers are preserved in git history at commit
`9b3c541` and can be restored if the TradingView path breaks.

---

## 1. Hosting platform

**Decision**: Cloudflare (Workers + D1 + Pages), all on the free tier.

**Rationale**:
- **Workers** has first-class `Cron Triggers` at 1-minute resolution — a
  `*/30 * * * *` trigger fires exactly at `:00`/`:30` UTC (the user-confirmed
  slot alignment).
- **D1** is a managed SQLite with a generous free tier (5 GB, 25 M row reads
  / 50 K row writes per day). Our write pattern is 1 row / 30 min = 48/day
  — four orders of magnitude inside the free quota.
- **Pages** hosts the SPA with global CDN, zero config, and auto-preview
  deploys per branch.
- Single vendor = one CI token, one domain, one dashboard, one bill
  (zero).

**Alternatives considered**:
- **Vercel Hobby + Supabase**: Vercel Hobby cron is limited to daily (not
  30-min) on free. Rejected.
- **Fly.io free tier**: effectively retired in 2024. Rejected.
- **GitHub Actions scheduled workflows**: 5-min minimum is fine, but persistence
  needs a separate DB and no HTTP frontend story — operationally clumsier.
  Rejected.
- **Self-host on home device**: explicitly ruled out by the free-cloud
  clarification.

---

## 2. Language / runtime

**Decision**: TypeScript (strict) on the Workers runtime for backend; TypeScript
+ React 18 + Vite 5 for frontend.

**Rationale**:
- Constitution Principle I mandates static type checking; TS is the native
  language of the Workers platform (WASM-free fetch handler) and has
  end-to-end type sharing between backend and frontend via the OpenAPI
  contract.
- React + Vite is the most searched-for, well-supported Pages stack;
  component ecosystem (Recharts, lightweight-charts, Testing Library) is
  deepest here.

**Alternatives considered**:
- **Workers Python / Rust** — Python is experimental, Rust is overkill for
  the problem size. Rejected.
- **SvelteKit or Astro** — smaller bundles, but fewer eyes on the stack
  and no first-party D1 bindings in some adapters. Rejected.

---

## 3. Data source endpoints

Per spec FR-001..FR-004, the fetcher needs four 30-min readings.

### 3.1 VIX

**Decision**: Yahoo Finance unofficial chart endpoint —
`GET https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=30m&range=1d`.

**Rationale**: Free, no API key, returns JSON with `meta.regularMarketPrice`
(the current/last close) and per-interval `indicators.quote[0].close[]`.
High reliability for popular tickers.

**Alternatives**: Stooq CSV (reliable but coarser intervals); official CBOE
feed (paid). Both rejected.

### 3.2 CNN Fear & Greed Index

**Decision**: CNN's own dataviz JSON endpoint —
`GET https://production.dataviz.cnn.io/index/fearandgreed/graphdata`.

**Rationale**: This is the undocumented-but-public endpoint that backs CNN's
own Fear & Greed page. Returns JSON including `fear_and_greed.score` (0–100)
and timestamp. Stable enough for daily use; no scraping of HTML. Requires
`User-Agent: Mozilla/5.0` header (it rejects empty/bot UAs) and `Accept`
header. Matches the spec Clarifications answer — "prefer free third-party
aggregator JSON; scrape only as fallback."

**Fallback**: If the CNN endpoint breaks (format change or block), the source
is flagged `fetch-failed` per FR-013 and the composite is computed without
it per FR-012. The fallback scrape path is documented in
`backend/src/fetchers/cnn-fg.ts` but **not** implemented in v1 — it is only
engaged if the JSON endpoint goes away.

**Alternatives**: RapidAPI CNN F&G wrappers (often paid or rate-limited on
free). Rejected.

### 3.3 S&P 500 — two series

Per the user's scoring directive (spec Clarifications and FR-005), the S&P
500 contributes via a **daily** flag ("3 red days in a row"), while the
historical view still renders **30-min** intraday candles for visual
context. Both series are fetched each cycle from Yahoo Finance:

- **Daily (for scoring)**:
  `GET https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=10d`.
  Returns the last ~7 daily closes. The flag is triggered iff the
  **tail-end streak** of red closes (`close[i] < close[i-1]`) has length
  **≥ 3**. In pseudocode: walk the completed bars from newest to oldest;
  count how many consecutive bars satisfy the red-close condition; if
  that count is 3 or more, the flag is triggered. A streak of 4, 5 or
  more also triggers. Incomplete bars (the current open day) are
  discarded before evaluation.
- **Intraday (for UI only)**:
  `GET https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=30m&range=5d`.
  Returns OHLC arrays for the last 5 trading days at 30-min granularity;
  not used for scoring, only fed to the `Sp500CandleChart` component.

**Rationale**: The user's "3 red days" condition is inherently a daily
signal; using 30-min bars would conflate intraday volatility with the
daily close-to-close pattern the user asked for. Separating the two
series keeps scoring logic trivially testable ("given 4 closes, is the
flag triggered?") without coupling it to intraday shape.

**Note on cadence**: Because the daily flag only changes at most once per
trading day (after the 16:00 ET close), its value will be identical across
most consecutive 30-min cycles. That is correct behaviour; no throttling
is needed because the fetch is cheap and the write is idempotent (dedup
by slot).

**Alternatives**: Open-vs-close "red" instead of close-vs-prior-close
("intraday red"). Rejected because "red day" in trading vernacular most
commonly means close-below-prior-close (a down day); we preserved the
user's likely intent.

### 3.4 S5FI (S&P 500 % above 50-DMA)

**Decision**: Yahoo Finance chart endpoint —
`GET https://query1.finance.yahoo.com/v8/finance/chart/%5ES5FI?interval=1d&range=5d`.

**Rationale**: S5FI is an end-of-day indicator; Yahoo publishes it daily.
At 30-min cadence we re-report the last daily close value, which is correct
behaviour for a daily indicator and is flagged `stale-source` per the spec
assumption during the day rather than `failed`.

**Alternatives**: Stooq daily CSV for `s5fi.us`; StockCharts `$SPXA50R`
(paywalled). Stooq is a viable fallback if Yahoo drops the symbol.

---

## 4. Scoring — four binary flags × 25 points

**Decision**: Composite score = sum of four independent binary flags, each
worth 25 points. The composite is always a member of `{0, 25, 50, 75, 100}`.

| Source | Flag rule | Raw comparison | Env var (threshold) | Notes |
|---|---|---|---|---|
| VIX | **VIX > threshold** | `latest_vix > 30` | `VIX_THRESHOLD=30` | Higher VIX = fear = buy signal. |
| CNN F&G | **F&G < threshold** | `latest_fg < 20` | `FG_THRESHOLD=20` | Low index = extreme fear = buy signal. |
| S5FI | **S5FI < threshold** | `latest_s5fi < 20` | `S5FI_THRESHOLD=20` | Low breadth = oversold = buy signal. |
| S&P 500 | **≥ N consecutive red daily closes** | tail-end red streak length ≥ 3 completed bars | `SP500_RED_DAYS_MIN=3` | "Red day" = `close[i] < close[i-1]`; completed bars only. Longer streaks (4, 5, …) also trigger. |

**Partial-composite rule** (interacts with spec FR-012): a source whose
fetch failed cannot evaluate its flag — it contributes **0 points** and the
snapshot is flagged `partial`. This means:

- Composite is always in `{0, 25, 50, 75, 100}`.
- With `n_failed` failed sources, the composite is bounded above by
  `25 × (4 − n_failed)`.
- A composite of `0` with `status = complete` means "no conditions
  triggered"; a composite of `0` with `status = partial` means "no
  conditions triggered among the sources that reported". The UI
  distinguishes these via the partial badge per FR-012.

**Rationale for storage shape** (see `data-model.md`): we keep the
`source_readings.normalised_value` column and use it to store the points
awarded (0 or 25). This lets historical composite queries keep the simple
`SUM(normalised_value) … GROUP BY slot_ts` pattern instead of introducing
a second aggregation path. We add a `flag_triggered` boolean alongside it
for UI convenience.

**Alternatives considered & rejected**:
- **Equal-weighted mean of normalised values** (the earlier plan): rejected
  because the user explicitly specified discrete 25-point flags.
- **Z-score / weighted formula**: deferred post-v1 tuning.
- **Graduated points per source** (e.g., half-credit when a value is
  near-but-not-past threshold): rejected — user's rule is binary.

**Configurability**: All four thresholds (`VIX_THRESHOLD`, `FG_THRESHOLD`,
`S5FI_THRESHOLD`, `SP500_RED_DAYS_MIN`) are Worker environment variables,
changeable via `wrangler secret put` with no redeploy and no schema
change. Default values match FR-005 exactly.

**Rendering** (see `contracts/ui-contract.md`): the composite is displayed
as a red-to-green heatmap bar with distinct colour stops at 0, 25, 50, 75,
100 (red → orange → yellow → yellow-green → green). Text label and numeric
value accompany the colour for accessibility (Principle III).

---

## 5. Storage schema

**Decision**: SQLite on D1 with two tables — `snapshots` and
`source_readings` — keyed by clock-aligned slot timestamp.

Detailed in [`data-model.md`](./data-model.md). Dedup is enforced by a
`UNIQUE` index on `snapshots.slot_ts`.

**Rationale**: Normalised split avoids re-declaring per-source columns on
every schema change, and natively supports the "per-source raw + normalised
value + fetch status + error reason" row structure from FR-007.

**Alternatives**: single wide row per snapshot (4 × 4 columns hard-coded).
Rejected — adding a fifth source later would require a migration.

---

## 6. Historical query performance

**Decision**: Server-side down-sampling for ranges > 7 days.

- ≤ 7 days: return raw 30-min rows (≤ 336 rows) — no aggregation.
- 7–30 days: aggregate to 2-hour buckets via `GROUP BY` on
  `slot_ts / 7200`.
- > 30 days / all time: aggregate to daily buckets via SQL date truncation.

**Rationale**: Principle IV caps browser-side rendering at ~1,000 rows.
D1's SQL `GROUP BY` is fast enough at our volume that aggregation is
cheaper than shipping raw rows. SC-004 (30-day view in < 3 s) is met easily.

**Alternatives**: client-side decimation (ships raw data, wastes bandwidth);
materialised views (not supported by D1 directly). Both rejected.

---

## 7. Frontend polling strategy

**Decision**: TanStack Query with `refetchInterval = 60_000` (60 s) for the
"latest snapshot" query, and manual invalidation on tab-visibility change.

**Rationale**: The backend persists a new row every 30 min, but the user
may have the tab open across slot boundaries. Polling every 60 s means the
UI reflects a new snapshot within 60 s of it being persisted (FR-015,
AS2.3). 60 s × no-change is a cheap HEAD-like fetch (< 1 KB response).

**Alternatives**: Server-Sent Events or Durable-Object WebSocket. Both add
complexity and aren't justified at 30-min write cadence. Rejected.

---

## 8. Observability

**Decision**: Cloudflare Workers Analytics Engine (free tier) for:
- `fetch.success{source}` counter
- `fetch.failure{source, reason}` counter
- `fetch.duration_ms{source}` histogram
- `cron.cycle.partial` counter (partial composites in last 24 h)

Plus `console.error` for unhandled exceptions (captured in Workers Logs
free tier, 3-day retention).

**Rationale**: Principle IV requires user-perceived latency and error rates
to be visible and alertable before a feature ships. Analytics Engine is
free, SQL-queryable, and retains 90 days.

**Alternatives**: Sentry free tier (good but adds a dependency and a second
dashboard); no observability (violates Principle IV). Rejected the latter.

---

## 9. Testing

**Decision**: three layers.

- **Unit** (Vitest): pure-function logic — normalisation, composite, slot
  alignment, response parsers. Fixture-driven; no network.
- **Integration** (Vitest + Miniflare 3 + local D1): exercises the cron
  handler end-to-end against a real local SQLite via Miniflare, with each
  fetcher mocked at the `fetch()` boundary (consistent with the
  constitution's "mocks only for third-party services we don't own"). API
  routes tested against the same local D1.
- **E2E** (Playwright): spin up preview deploy on each PR, exercise the
  dashboard and history pages; axe-core assertion at the end of each test
  for WCAG 2.1 AA compliance (Principle III).

**Rationale**: This matches the constitution's "integration tests exercise
real collaborators" clause — the DB is real, only the four upstream HTTP
calls are mocked.

---

## 10. CI / deploy

**Decision**: GitHub Actions — two workflows.

- `ci.yml` on every PR: install, lint, typecheck, unit, integration, build,
  bundle budget (bundlewatch), Lighthouse CI against a preview deploy.
- `deploy.yml` on merge to main: `wrangler deploy` (backend), `wrangler
  pages deploy` (frontend), run D1 migrations.

**Rationale**: All free for public repos; matches green-main policy from
Principle I.

---

## Summary

All NEEDS CLARIFICATION items from the spec and the plan's Technical Context
are now resolved. No ambiguity remains that would block Phase 1 design.
