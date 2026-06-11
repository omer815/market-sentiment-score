# Design — Market Sentiment Score: Radical Simplification (Phase 1)

**Date:** 2026-06-11 · **Owner:** omer (`omer815`) · **Branch:** `001-market-sentiment-score`
**Status:** Design approved, ready for implementation plan.

> Supersedes the multi-provider architecture in `HANDOFF.md` for Phase 1.
> `spec.md` still governs the *product* (the 4-signal score). This doc governs
> *how it is built and shipped now*. Persistence/history is explicitly **Phase 2**.

---

## 1. Goal

Ship the market sentiment score to production **now**, with the simplest
possible architecture. Strip everything that is not the score itself.

## 2. Decisions (locked)

1. **Stateless.** No database. The score is computed live on each request.
   History/persistence is deferred to Phase 2.
2. **One Vercel project.** Collapse the previous Cloudflare Worker + D1 + Pages
   **and** the Vercel TradingView sidecar (2 providers, 3 deploys, 6 endpoints)
   into a **single Vercel app**. The TradingView library needs Node, which
   Vercel functions provide — so the sidecar's reason to exist disappears and
   its logic moves in-process (a function call, not a network hop).
3. **Minimal surface.** Drop React, Vite, TanStack Query, and the entire
   component set (heatmap, breakdown, refresh button, last-refreshed,
   empty/error states, partial badge, auto-trigger). Keep only the 4-signal
   scoring logic and the 4 data fetchers.
4. **UI designed externally.** The visual UI is being designed by a separate
   service. Therefore the endpoint exposes a **stable JSON contract** that the
   designed page consumes. A minimal server-rendered HTML page ships as the
   default/fallback so the app is live and viewable today.
5. **Restructure in place.** Reuse the existing repo and the
   `001-market-sentiment-score` branch. Delete the old `backend/`, `frontend/`,
   and `scripts/` directories (git history preserves them).

## 3. Architecture

```
   ┌──────────────── ONE Vercel project ────────────────┐
   │  GET /api/score   → JSON contract (for designed UI) │
   │  GET /            → minimal HTML page (fallback)     │
   │                                                     │
   │  both call the same pipeline:                       │
   │    Promise.all([ tradingview(), cnnFg() ])          │
   │      • TradingView: VIX, S&P 500 daily, S5FI        │
   │      • CNN Fear & Greed (direct HTTPS)              │
   │    → score()  (4 flags × 25 → 0/25/50/75/100)       │
   │    → JSON  (and render() → HTML for GET /)          │
   └─────────────────────────────────────────────────────┘
```

No DB. No second provider. No build step required for the fallback page.

## 4. Files

```
market-sentiment/                  (repo root, restructured in place)
├─ api/
│  ├─ score.ts                     GET /api/score → JSON contract
│  └─ index.ts                     GET /          → minimal HTML (uses render.ts)
├─ lib/
│  ├─ tradingview.ts               reused: WS wrapper (VIX, SPX daily, S5FI)
│  ├─ cnn-fg.ts                    reused: fetch + parse CNN Fear & Greed
│  ├─ score.ts                     reused: flags + composite (the core logic)
│  ├─ pipeline.ts                  new tiny: fetch-all → score → result object
│  └─ render.ts                    new tiny: result → HTML string (fallback page)
├─ tests/score.test.ts             unit tests for scoring (the logic worth testing)
├─ package.json                    @mathieuc/tradingview + vitest
└─ vercel.json                     routing + node runtime
```

Reused near-verbatim from today's code: `score`, the 3 TradingView fetchers,
and the CNN F&G parser. The Worker↔sidecar network boundary becomes a function
call inside `pipeline.ts`.

## 5. JSON contract — `GET /api/score`

```jsonc
{
  "score": 75,                       // one of 0 | 25 | 50 | 75 | 100
  "label": "Strong buy signal",      // human label for the score
  "partial": false,                  // true if any source failed
  "asOf": "2026-06-11T14:00:00Z",    // when computed
  "signals": [
    { "key": "vix",   "label": "VIX",            "triggered": true,  "value": 34.2, "available": true,  "rule": "VIX > 30" },
    { "key": "fg",    "label": "Fear & Greed",   "triggered": false, "value": 41,   "available": true,  "rule": "F&G < 20" },
    { "key": "s5fi",  "label": "S5FI",           "triggered": true,  "value": 16,   "available": true,  "rule": "S5FI < 20" },
    { "key": "sp500", "label": "S&P 500 streak", "triggered": false, "value": 1,    "available": true,  "rule": ">= 3 red days" }
  ]
}
```

- A failed source: `available: false`, `triggered: false`, `value: null`,
  contributes **0** points, and sets top-level `partial: true`. Stale values
  are never carried forward.
- Response header `Cache-Control: s-maxage=300` — Vercel edge serves the same
  result for 5 min, so reloads are instant and TradingView is not hammered.

## 6. Scoring (unchanged from `spec.md` FR-005)

Composite = sum of 4 binary flags × 25 → `{0, 25, 50, 75, 100}`:
- VIX > 30
- CNN Fear & Greed < 20
- S5FI < 20
- S&P 500 ≥ 3 consecutive red daily closes

Thresholds stay env-tunable (`VIX_THRESHOLD`, `FG_THRESHOLD`, `S5FI_THRESHOLD`,
`SP500_RED_DAYS_MIN`) with the existing defaults.

## 7. Minimal fallback page — `GET /`

Server-rendered HTML, no framework: the big colored score number
(red→green across the 5 stops), a short text label, and the 4 signals each as
✓/✗ with its value. AA contrast, never color-only. Reload to refresh. This is a
placeholder until the externally-designed UI is wired in.

## 8. Error handling

- Per-source failure → that signal `available: false`, 0 points, `partial: true`.
  The whole response still succeeds (HTTP 200).
- Total failure (all sources down) → HTTP 502 with a small JSON error.
- TradingView symbol fallbacks if resolution fails: `TVC:VIX` / `SP:SPX` / bare
  `S5FI` (see HANDOFF §8).

## 9. Testing

- `tests/score.test.ts`: flag evaluation, red-day streak, composite math,
  partial handling. (Ported from existing backend unit tests.)
- Live data fetching is verified manually post-deploy (step 5 below).

## 10. Implementation steps (each independently shippable)

1. **Scaffold + score logic** — restructure repo, port `score.ts`, add tests. No network.
2. **Data fetchers + pipeline** — port `tradingview.ts` + `cnn-fg.ts`, wire
   `Promise.all` with per-source failure → 0 in `pipeline.ts`.
3. **Endpoints** — `api/score.ts` (JSON contract + cache header) and
   `api/index.ts` + `render.ts` (HTML fallback).
4. **Deploy** — `vercel.json`, deploy to prod under `omer815` (ASK before CLI).
5. **Verify live** — load prod URL + `curl /api/score`; apply symbol fallbacks
   if TradingView fails.

## 11. Out of scope (Phase 2+)

Persistence/history, 30-min cadence scheduler, charts/range picker, auth,
observability counters, and the externally-designed UI integration (lands when
the design is delivered).
