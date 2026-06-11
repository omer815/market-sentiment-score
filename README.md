# Market Sentiment Score

A market buy/sell score computed live from three public signals, served from a
single stateless Vercel app. Higher score = more fear/capitulation = stronger
contrarian buy signal. Not financial advice.

## What it scores (Phase 1)

Three binary signals. The score is the percentage that fired:
`score = round(triggered / 3 × 100)` → one of `{0, 33, 67, 100}`.

| Signal            | Source               | Triggers when                       |
| ----------------- | -------------------- | ----------------------------------- |
| VIX               | Yahoo Finance `^VIX` | `VIX > 30`                          |
| CNN Fear & Greed  | CNN dataviz (direct) | `F&G < 20`                          |
| S&P 500 streak    | Yahoo Finance `^GSPC`| `≥ 3 consecutive red daily closes`  |

| Score | Label              |
| ----- | ------------------ |
| 0     | No signal          |
| 33    | Weak buy signal    |
| 67    | Moderate buy signal|
| 100   | Strong buy signal  |

A failed source contributes 0 and the result is marked `partial` (the
denominator stays 3, so the score honestly understates). If all three fail the
score is `null` ("No data", HTTP 502). Nothing is stored — the score is computed
live on each request and edge-cached for 5 minutes.

> S5FI (% of S&P 500 above its 50-day MA) is **deferred to Phase 2** — Yahoo
> doesn't carry it. Persistence/history is also Phase 2.

## Architecture

One Vercel project. No database, no second provider, no WebSocket, no build step.

```
GET /            → api/index.ts → minimal HTML page (score + 3 ✓/✗ rows)
GET /api/score   → api/score.ts → JSON contract (for the externally-designed UI)
        │
        └── lib/pipeline.ts  → Promise.allSettled([fetchVix, fetchSp500Daily, fetchCnnFearAndGreed])
                              → lib/score.ts (buildScoreResult) → lib/render.ts (HTML)
```

## Repo layout

```
api/
  score.ts        GET /api/score → ScoreResult JSON + Cache-Control
  index.ts        GET /          → minimal HTML page
lib/
  config.ts       zod thresholds (VIX_THRESHOLD, FG_THRESHOLD, SP500_RED_DAYS_MIN)
  types.ts        ScoreResult, Signal, PipelineInputs, CompositeScore
  score.ts        red-day streak + buildScoreResult + labelForScore
  fetchers.ts     Yahoo (VIX, S&P 500) + CNN; pure parsers parseYahooChart/parseDaily/parseCnn
  pipeline.ts     runPipeline(): fan-out → score
  render.ts       renderHtml(result)
tests/            score, fetchers (parsers), render
vercel.json       routes / → api/index; node runtime
specs/001-market-sentiment-score/
  simplification-design.md   ← Phase 1 source of truth (this app)
  HANDOFF.md                 ← single-read session briefing
docs/superpowers/plans/      ← implementation plan
```

## Develop & deploy

```bash
pnpm install          # zod + @vercel/node + vitest + typescript
pnpm test             # vitest (score, parsers, render)
pnpm typecheck        # tsc --noEmit
vercel --prod         # deploy the single app → https://<project>.vercel.app
```

Thresholds are env-tunable (`VIX_THRESHOLD`, `FG_THRESHOLD`, `SP500_RED_DAYS_MIN`);
defaults are 30 / 20 / 3.

Both Yahoo and CNN require a browser-shaped `User-Agent` (sent automatically by
`lib/fetchers.ts`). Datacenter-IP blocking is the main deploy-time risk — verify
`GET /api/score` after the first deploy.

> **Resuming in a new session?** Start with
> [`specs/001-market-sentiment-score/HANDOFF.md`](specs/001-market-sentiment-score/HANDOFF.md)
> and [`specs/001-market-sentiment-score/simplification-design.md`](specs/001-market-sentiment-score/simplification-design.md).

## Status

Phase 1 source complete (single Vercel app, 3 signals). **Not yet installed,
tested, or deployed** — per the owner's keep-the-Mac-quiet preference, this is
source-only until the deploy step is explicitly approved.
