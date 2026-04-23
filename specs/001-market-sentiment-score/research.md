# Phase 0 — Research & Decisions

**Feature**: Market Sentiment Score Dashboard (`001-market-sentiment-score`)
**Date**: 2026-04-23 (refreshed for on-demand trigger architecture)
**Input constraints** (from spec Clarifications + Assumptions + owner directives):

- Free-tier cloud / serverless only (no paid tier, no always-on VM).
- Public dashboard, no authentication.
- Composite scoring: four binary flags × 25 points, composite ∈ `{0, 25, 50, 75, 100}`.
- 30-minute clock-aligned slots (`:00`, `:30` UTC) for storage, but in MVP the
  refresh is **on-demand** — no scheduled cron.
- Partial-composite rule: exclude failed sources, flag `partial`, never carry
  forward stale values.

All "NEEDS CLARIFICATION" items from the spec phase are resolved. Below are
the canonical decisions for the current plan. (This document supersedes
any earlier iteration — do not hunt for "amendments".)

---

## 1. Hosting — split between Cloudflare and Vercel

**Decision**: Cloudflare Workers + D1 + Pages as the primary surface, plus
a tiny Node serverless function on **Vercel Hobby** as a sidecar that
wraps the only Node-only dependency.

**Rationale**:

- **Workers** hosts the public API and the orchestrator. D1-bound, global
  CDN-fronted, free tier (100k requests/day) is ample for an owner-only
  dashboard.
- **D1** is a managed SQLite. Our write volume (one row per on-demand
  refresh) is orders of magnitude inside the free quota (50K writes/day).
- **Pages** hosts the SPA with zero config.
- **Vercel Hobby** runs Node 20 serverless functions, cold-starts in ~1 s,
  and fits the single-purpose "wrap `@mathieuc/tradingview`" use case.
  10-second per-invocation execution cap is comfortably above the
  worst-case TradingView quote-session roundtrip (~2–3 s).

**Alternatives considered**:

- **All Cloudflare, no sidecar**: would require dropping TradingView and
  using only HTTPS sources (Yahoo Finance + CNN). Rejected because the
  owner explicitly chose TradingView as the source of truth for VIX /
  S&P 500 / S5FI; the Yahoo "wrong VIX" issue was caused by reading the
  wrong JSON field (`indicators.quote[0].close[]` instead of
  `meta.regularMarketPrice`) and would recur under the "strict RTH data
  only" constraint some upstream snapshots drop the intraday close
  array.
- **All on Vercel, no Workers**: would lose D1 (the free-tier managed
  SQLite). Vercel Postgres free tier is much tighter; Vercel KV is not
  appropriate for time-series.
- **GH Actions scheduled workflow + push-to-Worker** (previous iteration):
  rejected because the owner's latest directive is "no cron for MVP, just
  an API that triggers the fetch". GH Actions cron is what this supersedes.
- **Reimplement TradingView's WebSocket protocol natively in Workers**:
  feasible (Workers supports outbound WebSockets via WinterCG
  `new WebSocket(url)`), but requires ~2–4 days reverse-engineering the
  `~m~<len>~m~<json>` framing + `set_auth_token` / `resolve_symbol` /
  `create_series` flows, and the code is fragile to TradingView protocol
  changes. Rejected for MVP.
- **Cloudflare Containers**: newly GA, would eliminate Vercel — but
  free-tier terms are not yet settled. Revisit post-MVP.

---

## 2. Trigger model — on-demand, no cron

**Decision**: the Worker exposes one write endpoint:

```
POST /api/snapshots/refresh
```

Behaviour:

1. Round the current wall-clock moment to the nearest 30-min UTC slot.
2. In parallel: fetch CNN F&G directly over HTTPS; fetch TradingView
   quotes / candles via the sidecar (`POST ${TRADINGVIEW_SIDECAR_URL}/fetch`).
3. Evaluate the four flags; compute the composite (FR-005, FR-012).
4. Insert a new `snapshots` + `source_readings` row-set.
5. Return the resulting Snapshot:
   - **201** if this is a new `slot_ts`.
   - **200** with `{slot_ts, inserted: false, snapshot: <existing>}` if a
     snapshot already exists for this slot (idempotent; caller receives
     the already-stored row, not an error).
6. No request body. No auth (open).

**Rationale**:

- The owner explicitly deprioritised the 30-min automatic cadence for
  MVP: "I want just an api that trigger the fetch flow and save it into
  the DB". Automatic cadence (US2, FR-001, FR-015, SC-002, SC-003) is
  deferred.
- D1 PK on `slot_ts` makes repeat refreshes inside the same slot safe
  and cheap. The caller can poll `/refresh` as aggressively as they like
  without polluting history — only the first call per slot actually
  writes.
- Zero background infrastructure. Nothing to "wake up" or "break"
  between uses.

**Alternatives considered**:

- **Cloudflare Workers scheduled handler**: was the original plan (see
  git history at commit `833a1f7`). Rejected when the owner requested
  TradingView because Workers can't run the WS client.
- **GitHub Actions scheduled workflow**: previous iteration. Rejected
  per the "cron not good" directive.
- **`POST /api/snapshots` with a body** (bulk insert): higher API surface
  area, and the caller would have to know how to score. The Worker owns
  scoring today and should keep owning it (single source of truth).
- **`?force=true` to overwrite the current slot's row**: not in MVP. If
  the owner hits the limit in practice, add it later — it's one extra
  query parameter.

**Cost / latency budget**: `/refresh` makes two outbound subrequests
(CNN + sidecar). End-to-end p95 budget is **≤ 6 s** (versus 300 ms p95
for read endpoints per Principle IV). The UI shows a busy state during
refresh so the user understands they're waiting on upstreams.

---

## 3. Data sources — TradingView (via sidecar) + CNN F&G (directly)

**Decision**: three sources live on TradingView behind the sidecar; one
source lives on CNN's own JSON endpoint called directly from the Worker.

### 3.1 VIX → TradingView `CBOE:VIX` (quote)

**Rationale**: CBOE is the definitive exchange for the VIX index;
TradingView publishes its live price. The sidecar calls `getQuote('CBOE:VIX')`
which waits for the first `qsd` frame from the TradingView quote session
and returns the `lp` (last price) field.

**Alternatives**: Yahoo Finance `/v8/finance/chart/^VIX`. Rejected per
the owner's "use TradingView as source of truth" directive. Also, the
older Yahoo implementation read the wrong field and returned stale
intraday data outside RTH — fixable but a foot-gun.

### 3.2 S&P 500 daily closes → TradingView `CBOE:SPX` (candles `D`)

**Rationale**: the scoring flag FR-005d is "≥ 3 consecutive red daily
closes". TradingView delivers up to 10 daily bars via
`create_series('D', 10)`; the sidecar returns only *completed* bars (it
drops bars whose start is within the last 12 h, i.e. today's
still-forming candle).

**Alternatives**: Yahoo Finance daily chart. Rejected for consistency
with VIX decision.

### 3.3 S5FI → TradingView `INDEX:S5FI` (quote)

**Rationale**: S5FI (S&P 500 % above 50-DMA) is a daily indicator.
TradingView publishes the latest close as the quote's last price. Values
are clamped to `[0, 100]` in the sidecar to defensively reject any
out-of-range payload (the field is a percentage).

**Alternatives**: Yahoo `^S5FI`, Stooq daily CSV. Either is a viable
fallback if TradingView drops the symbol; the sidecar is the single
place to swap it.

### 3.4 CNN Fear & Greed → `production.dataviz.cnn.io/index/fearandgreed/graphdata` (Worker, HTTPS)

**Rationale**: CNN's own undocumented-but-public JSON endpoint. Requires
a `User-Agent: Mozilla/5.0` header (it rejects empty / bot UAs). Returns
JSON including `fear_and_greed.score` (0–100) and timestamp. This is a
plain HTTPS GET — no reason to route it through the sidecar; doing so
would only add a round-trip.

**Fallback**: if CNN changes shape or starts blocking, the source is
flagged `fetch-failed` per FR-013 and the composite is computed without
it per FR-012. A scraping fallback against the public CNN page is
documented but not implemented in MVP.

---

## 4. Sidecar API

**Decision**: single endpoint, combined payload.

```
POST ${TRADINGVIEW_SIDECAR_URL}/fetch
→ 200 {
    "vix":   { "raw": 14.2,  "fetched_at": "2026-04-23T20:00:00Z" },
    "sp500": { "closes": [5100, 5090, 5075, 5060, 5055, 5070], "latest_date": "2026-04-22", "fetched_at": "..." },
    "s5fi":  { "raw": 58.4,  "fetched_at": "..." }
  }
→ 502 { "error": "fetch_failed", "detail": "<symbol>: <reason>" }  (per source, partial responses still 200)
```

- Request body is optional (reserved for future `{symbols: [...]}`
  filtering). For MVP the sidecar always returns all three.
- No auth. Open endpoint. Fine because it holds no secrets and its worst
  abuse is "someone else's dashboard gets free TradingView quotes via my
  Vercel account".
- Per-source failures are represented inside the 200 payload by omitting
  the failing source's key (Worker's `sidecar.ts` fetcher maps absence
  to `fetch-failed`). Only hard sidecar failures (cold-start crash,
  Vercel 5xx) surface as HTTP non-2xx to the Worker.

**Rationale**: combined single-call is one fewer subrequest from the
Worker's 50-per-request quota and reduces tail-latency risk (parallel
TradingView resolves inside the sidecar are faster than serial HTTP
calls from the Worker).

**Alternatives**: separate `GET /quote?symbol=…` and `GET /candles?symbol=…`.
Rejected — more code paths, more round-trips, no obvious MVP benefit.

---

## 5. Scoring — four binary flags × 25 points

**Decision**: unchanged from spec FR-005. Composite score = sum of four
binary flags, each worth 25 points. Composite is always a member of
`{0, 25, 50, 75, 100}`.

| Source | Flag rule | Raw comparison | Env var (threshold) | Notes |
|---|---|---|---|---|
| VIX | **VIX > threshold** | `latest_vix > 30` | `VIX_THRESHOLD=30` | Higher VIX = fear = buy signal. |
| CNN F&G | **F&G < threshold** | `latest_fg < 20` | `FG_THRESHOLD=20` | Low index = extreme fear = buy signal. |
| S5FI | **S5FI < threshold** | `latest_s5fi < 20` | `S5FI_THRESHOLD=20` | Low breadth = oversold = buy signal. |
| S&P 500 | **≥ N consecutive red daily closes** | tail-end red streak ≥ 3 completed bars | `SP500_RED_DAYS_MIN=3` | Red = `close[i] < close[i-1]`; completed bars only. Longer streaks also trigger. |

Partial-composite rule (interacts with FR-012): a source whose fetch
failed cannot evaluate its flag — it contributes **0 points** and the
snapshot is flagged `partial`. All four failing → `status = no-data`,
`composite_score = NULL`. Thresholds are env vars (`wrangler secret put`
or plain `vars` in `wrangler.toml`); no redeploy to re-tune.

**Rendering**: red-to-green heatmap bar with distinct stops at 0, 25,
50, 75, 100 (red → orange → yellow → yellow-green → green). Text label
and numeric value accompany the colour for accessibility (Principle III).
Per-flag breakdown rows show rule, raw value, ✓/✗, and points
contribution (FR-017).

---

## 6. Storage schema — unchanged

**Decision**: D1 SQLite with three tables — `snapshots`, `source_readings`,
`source_metadata`. Full detail in [`data-model.md`](./data-model.md). PK
on `snapshots.slot_ts` enforces the FR-008 dedup.

**Rationale**: normalised split avoids re-declaring per-source columns
on schema changes and natively supports per-source raw + normalised
value + fetch status + error reason (FR-007).

---

## 7. Historical queries

**Decision**: kept in the plan because the read endpoints already support
them, but will only produce useful results once US2's automatic cadence
populates history. For MVP, the only realistic historical data is
whatever the owner produces by hitting `/refresh` at different moments.

- ≤ 7 days: return raw 30-min rows (≤ 336 rows).
- 7–30 days: aggregate to 2-hour buckets.
- > 30 days: aggregate to daily buckets.

See `data-model.md` § "Query patterns".

---

## 8. Frontend polling / refresh UX

**Decision**: TanStack Query `refetchInterval = 30_000` for
`GET /api/snapshots/latest` (so the UI reflects a refresh initiated
elsewhere within 30 s), plus a **`<RefreshButton>`** on the dashboard
that calls `POST /api/snapshots/refresh` and invalidates the latest
query on success. While the refresh is in flight the button enters a
busy state.

**Rationale**: the only trigger in MVP is explicit. A visible button
matches the user's mental model and makes the 2–6 s latency budget
honest.

**Alternatives**: no button, curl-only. Rejected — the owner is the user.

---

## 9. Observability

**Decision**: Workers Analytics Engine (free tier) counters on:

- `refresh.success{source}` — per-source OK count.
- `refresh.failure{source, reason}` — per-source failure, reason =
  `fetch-failed | parse-failed | rate-limited | stale-source`.
- `refresh.duration_ms{source}` — histogram per source.
- `refresh.dedup_count` — count of `/refresh` calls that returned 200
  (same-slot repeat).

Plus `console.error` for unhandled exceptions (captured in Workers Logs
free tier, 3-day retention).

On the sidecar (Vercel): Vercel's default function-invocation logs
(10-day retention on Hobby).

**Rationale**: Principle IV requires user-perceived latency and error
rates to be visible before a feature ships. `/refresh` success/failure
+ duration is the exact moving part to watch. Automatic-cadence
metrics (scheduled-run success rate) are deferred with US2.

---

## 10. Testing

**Decision**: three layers.

- **Unit** (Vitest): pure-function logic — slot rounding, flag evaluation,
  composite, response parsers. Fixture-driven; no network.
- **Integration** (Vitest + Miniflare 3 + local D1): exercises `/refresh`
  end-to-end against a real local SQLite via Miniflare, with CNN's HTTP
  call and the sidecar mocked at the `fetch()` boundary. API routes
  tested against the same local D1. The sidecar has its own unit tests
  with a mocked TradingView WebSocket (no live WS in tests).
- **E2E** (Playwright, future): preview-deploy per PR, exercises the
  dashboard; axe-core for WCAG 2.1 AA.

**Rationale**: matches the constitution's "integration tests exercise
real collaborators" clause — the DB is real; only the two outbound
network calls are mocked, consistent with "mocks only for third-party
services we don't own".

---

## 11. CI / deploy

**Decision**: GitHub Actions.

- `ci.yml` on every PR: install, lint, typecheck, unit tests, integration
  tests, frontend build, bundle-size check (future bundlewatch),
  Lighthouse CI against preview (future).
- Deploy on merge to main:
  - `wrangler deploy` for the backend Worker.
  - `vercel --prod` (or Vercel GitHub integration) for the sidecar.
  - `wrangler pages deploy frontend/dist` for the frontend.
  - `wrangler d1 migrations apply --remote` for any pending migrations.

**Rationale**: all free for public repos. Matches green-main policy
(Principle I). No scheduled workflow (cron is gone).

---

## Summary

All NEEDS CLARIFICATION items and all Technical Context unknowns from
the plan are now resolved. The design is ready for Phase 1 contracts
and Phase 2 task generation.
