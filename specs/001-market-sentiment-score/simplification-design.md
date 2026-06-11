# Design — Market Sentiment Score: Radical Simplification (Phase 1)

**Date:** 2026-06-11 · **Owner:** omer (`omer815`) · **Branch:** `001-market-sentiment-score`
**Status:** Design approved, ready for implementation plan.

> Supersedes the multi-provider architecture in `HANDOFF.md` for Phase 1.
> `spec.md` governs the *product*; this doc governs *how it is built and shipped
> now*. Persistence/history is explicitly **Phase 2**.

---

## 1. Goal

Ship the market sentiment score to production **now**, with the simplest
possible architecture and the simplest possible data sources. Strip everything
that is not the score itself.

## 2. Decisions (locked)

1. **Stateless.** No database. Score computed live per request. History → Phase 2.
2. **One Vercel project.** Collapse the previous Cloudflare Worker + D1 + Pages
   **and** the Vercel TradingView sidecar (2 providers, 3 deploys, 6 endpoints)
   into a **single Vercel app**.
3. **No TradingView.** Phase 1 drops `@mathieuc/tradingview` and its WebSocket
   sidecar entirely. All data comes over plain HTTP/JSON. **No extra npm
   dependency for market data.**
4. **Three signals (S5FI dropped).** S5FI (% of S&P 500 above 50-day MA) is a
   breadth index Yahoo does not carry, so it is deferred to Phase 2. Phase 1
   scores on **VIX, CNN Fear & Greed, and the S&P 500 red-day streak**.
5. **Score = % of signals firing.** `round(triggered / 3 × 100)` →
   `{0, 33, 67, 100}`. The denominator is always 3, so a failed source can never
   contribute and the result is honestly *partial* (understated), matching the
   original spec rule "a failed fetch contributes 0 and flags the snapshot partial".
6. **Minimal surface.** No React/Vite/TanStack, no component set. One server-rendered
   HTML page + one JSON endpoint.
7. **UI designed externally.** The endpoint exposes a stable JSON contract for the
   externally-designed UI; a minimal HTML page ships as the default/fallback so the
   app is live today.
8. **Restructure in place.** Reuse the existing repo and `001-market-sentiment-score`
   branch. Delete old `backend/`, `frontend/`, `scripts/` (git history preserves them).

## 3. Data sources (Phase 1)

| Signal | Source | Endpoint | Triggers when |
| --- | --- | --- | --- |
| **VIX** | Yahoo Finance | `GET /v8/finance/chart/^VIX?interval=1d&range=5d` → `meta.regularMarketPrice` | VIX > 30 |
| **S&P 500 streak** | Yahoo Finance | `GET /v8/finance/chart/^GSPC?interval=1d&range=1mo` → daily closes | ≥ 3 consecutive red daily closes |
| **CNN Fear & Greed** | CNN (direct) | `GET production.dataviz.cnn.io/index/fearandgreed/graphdata` → `fear_and_greed.score` | F&G < 20 |

Both Yahoo and CNN require a browser-shaped `User-Agent` header (bot/empty UAs
get 403/429). All three are simple `fetch` + JSON parse — no WebSocket, no
auth, no crumb/cookie for the v8 chart endpoint.

## 4. Architecture

```
   ┌──────────────── ONE Vercel project ────────────────┐
   │  GET /api/score   → JSON contract (for designed UI) │
   │  GET /            → minimal HTML page (fallback)     │
   │                                                     │
   │  both call runPipeline():                           │
   │    Promise.allSettled([                             │
   │      fetchVix(),          // Yahoo ^VIX             │
   │      fetchSp500Daily(),   // Yahoo ^GSPC            │
   │      fetchCnnFearAndGreed() // CNN direct           │
   │    ])                                               │
   │    → buildScoreResult()  (round(fired/3 * 100))     │
   │    → JSON  (and render() → HTML for GET /)          │
   └─────────────────────────────────────────────────────┘
        │ HTTPS                          │ HTTPS
        ▼                                ▼
   ┌──────────────┐                ┌──────────────┐
   │ Yahoo Finance│                │   CNN F&G    │
   └──────────────┘                └──────────────┘
```

No DB. No second provider. No WebSocket. No build step for the fallback page.

## 5. Files

```
market-sentiment-score/            (repo root = the Vercel app)
├─ api/
│  ├─ score.ts                     GET /api/score → JSON contract
│  └─ index.ts                     GET /          → minimal HTML
├─ lib/
│  ├─ config.ts                    zod thresholds (VIX, FG, SP500_RED_DAYS_MIN)
│  ├─ types.ts                     ScoreResult, Signal, PipelineInputs, CompositeScore
│  ├─ score.ts                     red-streak + buildScoreResult + labelForScore
│  ├─ fetchers.ts                  Yahoo (VIX, S&P) + CNN F&G, with pure parsers
│  ├─ pipeline.ts                  runPipeline(): allSettled 3 fetchers → score
│  └─ render.ts                    result → HTML string
├─ tests/
│  ├─ score.test.ts                streak, composite %, partial, labels
│  ├─ fetchers.test.ts             parseYahooChart, parseDaily, parseCnn (pure)
│  └─ render.test.ts               normal + partial + no-data
├─ package.json                    zod + vitest + @vercel/node  (NO market-data dep)
├─ tsconfig.json
└─ vercel.json
```

## 6. JSON contract — `GET /api/score`

```jsonc
{
  "score": 67,                       // one of 0 | 33 | 67 | 100, or null (all failed)
  "label": "Moderate buy signal",
  "partial": false,                  // true if any source failed
  "asOf": "2026-06-11T14:00:00Z",
  "signals": [
    { "key": "vix",   "label": "VIX",            "triggered": true,  "value": 34.2, "available": true, "rule": "VIX > 30" },
    { "key": "fg",    "label": "Fear & Greed",   "triggered": false, "value": 41,   "available": true, "rule": "F&G < 20" },
    { "key": "sp500", "label": "S&P 500 streak", "triggered": true,  "value": 3,    "available": true, "rule": ">= 3 consecutive red days" }
  ]
}
```

- Failed source → `available:false`, `triggered:false`, `value:null`, contributes
  0, sets `partial:true`. Never carries a stale value.
- All three failed → HTTP 502, `score:null`, `label:"No data"`.
- Response header `Cache-Control: s-maxage=300, stale-while-revalidate=60` — Vercel
  edge serves the same result for 5 min.

## 7. Scoring

`triggered` = number of available signals that fired. `score = round(triggered / 3 × 100)`.
Because the denominator is fixed at 3 and `triggered ∈ {0,1,2,3}`, the score always
lands on a clean stop:

| triggered | score | label |
| --- | --- | --- |
| 0 | 0 | No signal |
| 1 | 33 | Weak buy signal |
| 2 | 67 | Moderate buy signal |
| 3 | 100 | Strong buy signal |
| (all 3 sources failed) | null | No data |

Thresholds stay env-tunable: `VIX_THRESHOLD` (30), `FG_THRESHOLD` (20),
`SP500_RED_DAYS_MIN` (3). (`S5FI_THRESHOLD` removed for Phase 1.)

## 8. Minimal fallback page — `GET /`

Server-rendered HTML, no framework: big colored score number (red→green across
the 4 stops), text label, and the 3 signals each as ✓/✗ with value. AA contrast,
never color-only. Reload to refresh. Placeholder until the designed UI is wired in.

## 9. Error handling

- Per-source failure → that signal `available:false`, 0 contribution, `partial:true`;
  whole response still HTTP 200.
- All sources down → HTTP 502 with `score:null`.
- Yahoo symbol fallbacks if `^VIX`/`^GSPC` fail: try without the caret, or
  `%5EVIX`/`%5EGSPC` URL-encoding (the caret must be encoded in the path).

## 10. Testing

- `tests/score.test.ts`: red-day streak, composite %, partial, label mapping.
- `tests/fetchers.test.ts`: `parseYahooChart`, `parseDaily`, `parseCnn` (pure).
- `tests/render.test.ts`: HTML for normal / partial / no-data.
- Live fetching verified manually post-deploy.

## 11. Implementation steps (each independently shippable)

1. **Restructure** repo to single-app root (delete old trees, root config).
2. **Scoring** — `config`, `types`, `score`; full TDD.
3. **Fetchers** — Yahoo (VIX, S&P) + CNN, with pure-parser tests.
4. **Pipeline** — `allSettled` 3 fetchers → `buildScoreResult`.
5. **Render** — minimal HTML page; TDD.
6. **Endpoints** — `api/score.ts` (JSON) + `api/index.ts` (HTML).
7. **Docs** — update HANDOFF / README / CLAUDE.
8. **Deploy + verify** — install, `vercel --prod`, curl, push. (ASK before each side-effecting command.)

## 12. Out of scope (Phase 2+)

Persistence/history, S5FI signal (and the return to a 4-signal / 0–100-by-25 scale),
TradingView re-integration if ever needed, 30-min cadence scheduler, charts,
auth, observability counters, externally-designed UI integration.
