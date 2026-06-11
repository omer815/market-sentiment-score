# Market Sentiment Score — Phase 1 Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the market-sentiment app into a single stateless Vercel project that fetches 3 market signals over plain HTTP/JSON (Yahoo Finance + CNN), scores them as a percentage, and serves both a JSON contract (`GET /api/score`) and a minimal HTML page (`GET /`).

**Architecture:** One Vercel app at the repo root. No database, no second provider, no WebSocket, no market-data npm dependency, no build framework. Two serverless functions (`api/score.ts`, `api/index.ts`) call a shared in-process pipeline (`lib/pipeline.ts`) that fans out to 3 fetchers via `Promise.allSettled`, scores with `lib/score.ts`, and returns a `ScoreResult`. A failed source contributes 0 and marks the result `partial`. The old `backend/`, `frontend/`, `scripts/` trees are deleted (git history preserves them).

**Tech Stack:** Node ≥20 (ESM, `"type": "module"`), TypeScript 5.5 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `moduleResolution: Bundler`, `.js` import specifiers), `@vercel/node` runtime, `zod`, `vitest`. **No `@mathieuc/tradingview`** — VIX and S&P 500 come from Yahoo Finance's public `v8/finance/chart` JSON endpoint; CNN Fear & Greed direct.

Reference design: `specs/001-market-sentiment-score/simplification-design.md`.

**Score model:** 3 binary signals (VIX > 30, CNN F&G < 20, S&P 500 ≥ 3 red days). `score = round(triggered / 3 × 100)` → `{0, 33, 67, 100}`, or `null` when all sources fail. S5FI is deferred to Phase 2.

---

## File structure (after this plan)

```
market-sentiment-score/            (repo root = the Vercel app)
├─ api/
│  ├─ score.ts        GET /api/score → ScoreResult JSON + Cache-Control
│  └─ index.ts        GET /          → minimal HTML page
├─ lib/
│  ├─ config.ts       zod ScoringConfig from env (VIX, FG, SP500_RED_DAYS_MIN)
│  ├─ types.ts        ScoreResult, Signal, PipelineInputs, CompositeScore, SignalKey
│  ├─ score.ts        redDayTailStreak + buildScoreResult + labelForScore
│  ├─ fetchers.ts     Yahoo (VIX, S&P 500) + CNN; pure parsers parseYahooChart/parseDaily/parseCnn
│  ├─ pipeline.ts     runPipeline(): allSettled 3 fetchers → buildScoreResult
│  └─ render.ts       renderHtml(result) → HTML string
├─ tests/
│  ├─ score.test.ts   streak, composite %, partial, labels
│  ├─ fetchers.test.ts parseYahooChart + parseDaily + parseCnn
│  └─ render.test.ts  renderHtml normal + partial + no-data
├─ package.json
├─ tsconfig.json
├─ vercel.json
└─ .gitignore
```

The network bodies of `lib/fetchers.ts` and the two `api/*.ts` endpoints are **not** unit-tested — they need live Yahoo/CNN and are verified manually post-deploy (Task 8). Only pure logic is tested.

---

## Task 1: Restructure the repo to a single-app root

**Files:**
- Delete: `backend/`, `frontend/`, `scripts/`, `pnpm-workspace.yaml`, `.eslintrc.cjs`
- Create: `package.json` (replace root), `tsconfig.json`, `vercel.json`, `.gitignore` (replace)

- [ ] **Step 1: Delete the old workspace trees**

```bash
cd /Users/omermircor/personal/dashboard/dashboard
git rm -r backend frontend scripts pnpm-workspace.yaml .eslintrc.cjs
```

Expected: git stages the deletions (history keeps them; this is the agreed restructure-in-place).

- [ ] **Step 2: Replace root `package.json`**

```json
{
  "name": "market-sentiment-score",
  "private": true,
  "version": "0.2.0",
  "type": "module",
  "description": "Stateless market sentiment buy/sell score (VIX, CNN F&G, S&P 500) on a single Vercel app.",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@vercel/node": "^3.2.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "noEmit": true
  },
  "include": ["api/**/*.ts", "lib/**/*.ts", "tests/**/*.ts"]
}
```

(`tsconfig.base.json` already exists at the root and is kept as-is.)

- [ ] **Step 4: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/score.ts": { "runtime": "@vercel/node@3.2.0", "maxDuration": 10 },
    "api/index.ts": { "runtime": "@vercel/node@3.2.0", "maxDuration": 10 }
  },
  "rewrites": [{ "source": "/", "destination": "/api/index" }]
}
```

- [ ] **Step 5: Replace `.gitignore`**

```
node_modules/
.vercel/
.DS_Store
*.log
coverage/
```

- [ ] **Step 6: Commit the restructure**

```bash
cd /Users/omermircor/personal/dashboard/dashboard
git add -A
git commit -m "refactor: restructure to single Vercel app (delete worker/frontend/sidecar)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Scoring logic (the core, fully tested)

**Files:**
- Create: `lib/config.ts`, `lib/types.ts`, `lib/score.ts`
- Test: `tests/score.test.ts`

- [ ] **Step 1: Create `lib/config.ts`**

```typescript
import { z } from 'zod';

const numFromString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : Number(v)))
  .refine((n) => Number.isFinite(n), { message: 'must be a finite number' });

const ConfigSchema = z.object({
  VIX_THRESHOLD: numFromString.default(30),
  FG_THRESHOLD: numFromString.default(20),
  SP500_RED_DAYS_MIN: numFromString
    .default(3)
    .refine((n) => Number.isInteger(n) && n >= 1, { message: 'must be a positive integer' }),
});

export type ScoringConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, unknown>): ScoringConfig {
  return ConfigSchema.parse({
    VIX_THRESHOLD: env['VIX_THRESHOLD'],
    FG_THRESHOLD: env['FG_THRESHOLD'],
    SP500_RED_DAYS_MIN: env['SP500_RED_DAYS_MIN'],
  });
}
```

- [ ] **Step 2: Create `lib/types.ts`**

```typescript
export type CompositeScore = 0 | 33 | 67 | 100;

export type SignalKey = 'vix' | 'fg' | 'sp500';

export const TOTAL_SIGNALS = 3;

export interface Signal {
  key: SignalKey;
  label: string;
  triggered: boolean;
  value: number | null; // null when the source was unavailable
  available: boolean;
  rule: string;
}

export interface ScoreResult {
  score: CompositeScore | null; // null only when every source failed
  label: string;
  partial: boolean;
  asOf: string;
  signals: Signal[];
}

// One per source; the sp500 streak is computed in buildScoreResult, so the
// pipeline supplies raw closes here.
export interface PipelineInputs {
  vix: { ok: true; raw: number } | { ok: false };
  fg: { ok: true; raw: number } | { ok: false };
  sp500: { ok: true; closes: number[] } | { ok: false };
}
```

- [ ] **Step 3: Write the failing tests `tests/score.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';
import { redDayTailStreak, buildScoreResult, labelForScore } from '../lib/score.js';
import type { PipelineInputs } from '../lib/types.js';

const cfg = loadConfig({}); // defaults: VIX>30, FG<20, streak>=3
const AS_OF = '2026-06-11T14:00:00Z';

describe('redDayTailStreak', () => {
  it('counts the trailing run of lower closes', () => {
    expect(redDayTailStreak([10, 9, 8, 7])).toBe(3);
  });
  it('stops at the first non-red day from the tail', () => {
    expect(redDayTailStreak([10, 8, 9, 8, 7])).toBe(2);
  });
  it('returns 0 for fewer than 2 closes', () => {
    expect(redDayTailStreak([5])).toBe(0);
  });
});

describe('labelForScore', () => {
  it('maps each stop to a label', () => {
    expect(labelForScore(0)).toBe('No signal');
    expect(labelForScore(33)).toBe('Weak buy signal');
    expect(labelForScore(67)).toBe('Moderate buy signal');
    expect(labelForScore(100)).toBe('Strong buy signal');
    expect(labelForScore(null)).toBe('No data');
  });
});

describe('buildScoreResult', () => {
  const allInputs = (o: Partial<PipelineInputs> = {}): PipelineInputs => ({
    vix: { ok: true, raw: 35 },
    fg: { ok: true, raw: 15 },
    sp500: { ok: true, closes: [10, 9, 8, 7] },
    ...o,
  });

  it('scores 100 when all three signals trigger', () => {
    const r = buildScoreResult(allInputs(), cfg, AS_OF);
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.signals.every((s) => s.triggered && s.available)).toBe(true);
  });

  it('scores 0 when no signal triggers', () => {
    const r = buildScoreResult(
      allInputs({
        vix: { ok: true, raw: 12 },
        fg: { ok: true, raw: 60 },
        sp500: { ok: true, closes: [7, 8, 9, 10] },
      }),
      cfg,
      AS_OF,
    );
    expect(r.score).toBe(0);
    expect(r.label).toBe('No signal');
  });

  it('scores 67 when two of three trigger', () => {
    const r = buildScoreResult(allInputs({ sp500: { ok: true, closes: [7, 8, 9, 10] } }), cfg, AS_OF);
    expect(r.score).toBe(67); // vix + fg fire, sp500 does not
  });

  it('marks partial and excludes failed sources (denominator stays 3)', () => {
    const r = buildScoreResult(allInputs({ vix: { ok: false } }), cfg, AS_OF);
    expect(r.partial).toBe(true);
    expect(r.score).toBe(67); // fg + sp500 fire of 3 -> round(2/3*100)
    const vix = r.signals.find((s) => s.key === 'vix')!;
    expect(vix.available).toBe(false);
    expect(vix.triggered).toBe(false);
    expect(vix.value).toBeNull();
  });

  it('returns null score and No data when every source fails', () => {
    const r = buildScoreResult(
      { vix: { ok: false }, fg: { ok: false }, sp500: { ok: false } },
      cfg,
      AS_OF,
    );
    expect(r.score).toBeNull();
    expect(r.label).toBe('No data');
    expect(r.partial).toBe(true);
  });

  it('exposes the sp500 streak as the signal value', () => {
    const r = buildScoreResult(allInputs(), cfg, AS_OF);
    const sp = r.signals.find((s) => s.key === 'sp500')!;
    expect(sp.value).toBe(3);
    expect(sp.rule).toContain('3');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test`
Expected: FAIL — `Cannot find module '../lib/score.js'`.

- [ ] **Step 5: Implement `lib/score.ts`**

```typescript
import type { ScoringConfig } from './config.js';
import type { CompositeScore, PipelineInputs, ScoreResult, Signal } from './types.js';
import { TOTAL_SIGNALS } from './types.js';

// Length of the tail run of red days (close[i] < close[i-1]).
export function redDayTailStreak(closes: ReadonlyArray<number>): number {
  if (closes.length < 2) return 0;
  let streak = 0;
  for (let i = closes.length - 1; i >= 1; i--) {
    const cur = closes[i]!;
    const prev = closes[i - 1]!;
    if (cur < prev) streak++;
    else break;
  }
  return streak;
}

export function labelForScore(score: CompositeScore | null): string {
  switch (score) {
    case null:
      return 'No data';
    case 0:
      return 'No signal';
    case 33:
      return 'Weak buy signal';
    case 67:
      return 'Moderate buy signal';
    case 100:
      return 'Strong buy signal';
  }
}

// Maps the firing count to the discrete 0/33/67/100 scale.
function scoreForFiring(triggered: number): CompositeScore {
  return Math.round((triggered / TOTAL_SIGNALS) * 100) as CompositeScore;
}

// Pure: maps fetched inputs + thresholds into the public ScoreResult contract.
export function buildScoreResult(
  inputs: PipelineInputs,
  cfg: ScoringConfig,
  asOf: string,
): ScoreResult {
  const signals: Signal[] = [
    buildScalar('vix', 'VIX', inputs.vix, `VIX > ${cfg.VIX_THRESHOLD}`, (raw) => raw > cfg.VIX_THRESHOLD),
    buildScalar('fg', 'Fear & Greed', inputs.fg, `F&G < ${cfg.FG_THRESHOLD}`, (raw) => raw < cfg.FG_THRESHOLD),
    buildSp500(inputs.sp500, cfg),
  ];

  const available = signals.filter((s) => s.available);
  const partial = available.length < signals.length;

  if (available.length === 0) {
    return { score: null, label: labelForScore(null), partial: true, asOf, signals };
  }

  const firing = available.filter((s) => s.triggered).length;
  const score = scoreForFiring(firing);
  return { score, label: labelForScore(score), partial, asOf, signals };
}

function buildScalar(
  key: 'vix' | 'fg',
  label: string,
  input: { ok: true; raw: number } | { ok: false },
  rule: string,
  triggers: (raw: number) => boolean,
): Signal {
  if (!input.ok) {
    return { key, label, triggered: false, value: null, available: false, rule };
  }
  return { key, label, triggered: triggers(input.raw), value: input.raw, available: true, rule };
}

function buildSp500(
  input: { ok: true; closes: number[] } | { ok: false },
  cfg: ScoringConfig,
): Signal {
  const rule = `>= ${cfg.SP500_RED_DAYS_MIN} consecutive red days`;
  if (!input.ok) {
    return { key: 'sp500', label: 'S&P 500 streak', triggered: false, value: null, available: false, rule };
  }
  const streak = redDayTailStreak(input.closes);
  return {
    key: 'sp500',
    label: 'S&P 500 streak',
    triggered: streak >= cfg.SP500_RED_DAYS_MIN,
    value: streak,
    available: true,
    rule,
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test`
Expected: PASS — all `score.test.ts` cases green.

- [ ] **Step 7: Commit**

```bash
git add lib/config.ts lib/types.ts lib/score.ts tests/score.test.ts
git commit -m "feat: scoring logic — 3 signals, score = round(fired/3*100)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Data fetchers (Yahoo + CNN, with pure-parser tests)

**Files:**
- Create: `lib/fetchers.ts`
- Test: `tests/fetchers.test.ts`

- [ ] **Step 1: Write the failing parser tests `tests/fetchers.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { parseYahooChart, parseDaily, parseCnn } from '../lib/fetchers.js';

const NOW = Date.parse('2026-06-11T14:00:00Z');
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('parseYahooChart', () => {
  it('extracts regularMarketPrice and (ts, close) pairs, dropping null closes', () => {
    const json = {
      chart: {
        result: [
          {
            meta: { regularMarketPrice: 34.2 },
            timestamp: [sec('2026-06-09T20:00:00Z'), sec('2026-06-10T20:00:00Z'), sec('2026-06-11T13:00:00Z')],
            indicators: { quote: [{ close: [100, 99, null] }] },
          },
        ],
      },
    };
    const out = parseYahooChart(json);
    expect(out.regularMarketPrice).toBeCloseTo(34.2);
    expect(out.bars).toEqual([
      { ts: sec('2026-06-09T20:00:00Z'), close: 100 },
      { ts: sec('2026-06-10T20:00:00Z'), close: 99 },
    ]);
  });

  it('throws on a malformed payload', () => {
    expect(() => parseYahooChart({ chart: { result: [] } })).toThrow();
  });
});

describe('parseDaily', () => {
  const day = (n: number) => sec(`2026-06-${String(n).padStart(2, '0')}T20:00:00Z`);

  it('drops the still-forming candle (within 12h) and returns completed closes oldest-first', () => {
    const bars = [
      { ts: day(8), close: 100 },
      { ts: day(9), close: 99 },
      { ts: day(10), close: 98 },
      { ts: Math.floor(NOW / 1000) - 3600, close: 97 }, // today, unfinished -> dropped
    ];
    const out = parseDaily(bars, NOW);
    expect(out.closes).toEqual([100, 99, 98]);
  });

  it('throws when fewer than 2 completed bars', () => {
    expect(() => parseDaily([{ ts: day(10), close: 98 }], NOW)).toThrow();
  });
});

describe('parseCnn', () => {
  it('extracts the fear & greed score', () => {
    const r = parseCnn({ fear_and_greed: { score: 41.2 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.raw).toBeCloseTo(41.2);
  });

  it('fails when no usable score', () => {
    const r = parseCnn({ fear_and_greed: {} });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test fetchers`
Expected: FAIL — `Cannot find module '../lib/fetchers.js'`.

- [ ] **Step 3: Implement `lib/fetchers.ts`**

```typescript
// All Phase-1 data sources over plain HTTP/JSON. No WebSocket, no extra deps.
// Yahoo + CNN both require a browser-shaped User-Agent (bot/empty UAs get 403/429).

const UA = 'Mozilla/5.0 (market-sentiment-dashboard)';
const COMMON_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ---- Yahoo Finance chart endpoint ----
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';

export interface YahooChart {
  regularMarketPrice: number | null;
  bars: Array<{ ts: number; close: number }>;
}

// Pure. Throws if the payload has no result row.
export function parseYahooChart(json: unknown): YahooChart {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | {
        meta?: { regularMarketPrice?: number };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }
    | undefined;
  if (!result) throw new Error('Yahoo: empty chart result');

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const bars: Array<{ ts: number; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = closes[i];
    if (typeof ts === 'number' && typeof close === 'number' && Number.isFinite(close)) {
      bars.push({ ts, close });
    }
  }
  const rmp = result.meta?.regularMarketPrice;
  return { regularMarketPrice: typeof rmp === 'number' && Number.isFinite(rmp) ? rmp : null, bars };
}

async function fetchYahooChart(
  symbol: string,
  range: string,
  fetchImpl: typeof fetch,
): Promise<YahooChart> {
  // The caret in ^VIX / ^GSPC must be URL-encoded in the path.
  const url = `${YAHOO_CHART}${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const res = await fetchImpl(url, { headers: COMMON_HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Yahoo ${symbol} HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  return parseYahooChart(await res.json());
}

export async function fetchVix(fetchImpl: typeof fetch = fetch): Promise<{ raw: number }> {
  const chart = await fetchYahooChart('^VIX', '5d', fetchImpl);
  const raw = chart.regularMarketPrice ?? chart.bars.at(-1)?.close;
  if (typeof raw !== 'number') throw new Error('VIX: no usable price from Yahoo');
  return { raw };
}

export interface Sp500Daily {
  closes: number[];
}

export async function fetchSp500Daily(fetchImpl: typeof fetch = fetch): Promise<Sp500Daily> {
  const chart = await fetchYahooChart('^GSPC', '1mo', fetchImpl);
  return parseDaily(chart.bars);
}

// Pure. Drops any bar within the last 12h (today's unfinished candle).
export function parseDaily(
  bars: Array<{ ts: number; close: number }>,
  nowMs: number = Date.now(),
): Sp500Daily {
  const cutoff = nowMs / 1000 - 12 * 60 * 60;
  const completed = bars
    .filter((b) => Number.isFinite(b.close) && b.ts < cutoff)
    .sort((a, b) => a.ts - b.ts);
  if (completed.length < 2) {
    throw new Error(`S&P 500 daily: not enough completed bars (${completed.length})`);
  }
  return { closes: completed.map((b) => b.close) };
}

// ---- CNN Fear & Greed (direct) ----
const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

export type CnnParse = { ok: true; raw: number } | { ok: false; error: string };

export async function fetchCnnFearAndGreed(fetchImpl: typeof fetch = fetch): Promise<CnnParse> {
  try {
    const res = await fetchImpl(CNN_URL, { headers: COMMON_HEADERS });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `CNN F&G HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    return parseCnn(await res.json());
  } catch (err) {
    return { ok: false, error: `CNN F&G: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Pure.
export function parseCnn(json: unknown): CnnParse {
  const score = (json as { fear_and_greed?: { score?: number } })?.fear_and_greed?.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return { ok: false, error: 'CNN F&G: no usable score in response' };
  }
  return { ok: true, raw: score };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test fetchers`
Expected: PASS — `parseYahooChart` + `parseDaily` + `parseCnn` cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/fetchers.ts tests/fetchers.test.ts
git commit -m "feat: Yahoo (VIX, S&P 500) + CNN fetchers over plain HTTP/JSON

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: The pipeline (fan-out + score)

**Files:**
- Create: `lib/pipeline.ts`

Thin orchestration over `Promise.allSettled` + `buildScoreResult` (both already tested). No new unit test — relies on Task 2 tests plus manual verification in Task 8.

- [ ] **Step 1: Implement `lib/pipeline.ts`**

```typescript
import { loadConfig } from './config.js';
import { fetchVix, fetchSp500Daily, fetchCnnFearAndGreed } from './fetchers.js';
import { buildScoreResult } from './score.js';
import type { PipelineInputs, ScoreResult } from './types.js';

// Fan out to all three sources in parallel; a rejected/failed source becomes
// {ok:false} and contributes 0 (buildScoreResult marks the result partial).
export async function runPipeline(env: Record<string, unknown> = process.env): Promise<ScoreResult> {
  const cfg = loadConfig(env);
  const asOf = new Date().toISOString();

  const [vix, sp500, fg] = await Promise.allSettled([
    fetchVix(),
    fetchSp500Daily(),
    fetchCnnFearAndGreed(),
  ]);

  const inputs: PipelineInputs = {
    vix: vix.status === 'fulfilled' ? { ok: true, raw: vix.value.raw } : { ok: false },
    sp500: sp500.status === 'fulfilled' ? { ok: true, closes: sp500.value.closes } : { ok: false },
    fg: fg.status === 'fulfilled' && fg.value.ok ? { ok: true, raw: fg.value.raw } : { ok: false },
  };

  return buildScoreResult(inputs, cfg, asOf);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline.ts
git commit -m "feat: in-process pipeline (allSettled 3 fetchers -> buildScoreResult)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: HTML render (tested)

**Files:**
- Create: `lib/render.ts`
- Test: `tests/render.test.ts`

- [ ] **Step 1: Write the failing tests `tests/render.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { renderHtml } from '../lib/render.js';
import type { ScoreResult } from '../lib/types.js';

const base: ScoreResult = {
  score: 67,
  label: 'Moderate buy signal',
  partial: false,
  asOf: '2026-06-11T14:00:00Z',
  signals: [
    { key: 'vix', label: 'VIX', triggered: true, value: 34.2, available: true, rule: 'VIX > 30' },
    { key: 'fg', label: 'Fear & Greed', triggered: false, value: 41, available: true, rule: 'F&G < 20' },
    { key: 'sp500', label: 'S&P 500 streak', triggered: true, value: 3, available: true, rule: '>= 3 consecutive red days' },
  ],
};

describe('renderHtml', () => {
  it('shows the score, label, and a row per signal', () => {
    const html = renderHtml(base);
    expect(html).toContain('67');
    expect(html).toContain('Moderate buy signal');
    expect(html).toContain('VIX');
    expect(html).toContain('S&amp;P 500 streak'); // HTML-escaped
    expect(html).toContain('✓');
    expect(html).toContain('✗');
  });

  it('renders unavailable signals as (unavailable)', () => {
    const partial: ScoreResult = {
      ...base,
      partial: true,
      signals: [{ ...base.signals[0]!, triggered: false, value: null, available: false }, ...base.signals.slice(1)],
    };
    const html = renderHtml(partial);
    expect(html).toContain('unavailable');
  });

  it('renders No data when score is null', () => {
    const html = renderHtml({ ...base, score: null, label: 'No data' });
    expect(html).toContain('No data');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test render`
Expected: FAIL — `Cannot find module '../lib/render.js'`.

- [ ] **Step 3: Implement `lib/render.ts`**

```typescript
import type { CompositeScore, ScoreResult, Signal } from './types.js';

// Red -> green across the 4 discrete stops.
const STOP_COLORS: Record<number, string> = {
  0: '#c0392b',
  33: '#e67e22',
  67: '#7dcea0',
  100: '#27ae60',
};

function colorFor(score: CompositeScore | null): string {
  if (score === null) return '#7f8c8d';
  return STOP_COLORS[score] ?? '#7f8c8d';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function signalRow(s: Signal): string {
  const mark = !s.available ? '—' : s.triggered ? '✓' : '✗';
  const valueText = !s.available ? '(unavailable)' : String(s.value);
  return `
    <li class="signal ${s.triggered && s.available ? 'on' : 'off'}">
      <span class="mark" aria-hidden="true">${mark}</span>
      <span class="name">${esc(s.label)}</span>
      <span class="value">${esc(valueText)}</span>
      <span class="rule">${esc(s.rule)}</span>
    </li>`;
}

export function renderHtml(result: ScoreResult): string {
  const color = colorFor(result.score);
  const scoreText = result.score === null ? '—' : String(result.score);
  const rows = result.signals.map(signalRow).join('');
  const partialNote = result.partial
    ? `<p class="partial">Some sources were unavailable — score may be understated.</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Market Sentiment Score</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; }
    main { text-align: center; padding: 2rem; max-width: 32rem; }
    .score { font-size: 6rem; font-weight: 800; line-height: 1; color: ${color}; }
    .label { font-size: 1.5rem; margin: 0.25rem 0 1.5rem; }
    ul { list-style: none; padding: 0; text-align: left; }
    .signal { display: grid; grid-template-columns: 1.5rem 1fr auto; gap: 0.5rem 0.75rem; padding: 0.5rem 0; border-top: 1px solid #8884; align-items: baseline; }
    .signal .rule { grid-column: 2 / 4; font-size: 0.8rem; opacity: 0.6; }
    .mark { font-weight: 700; }
    .signal.on .mark { color: #27ae60; }
    .signal.off .mark { color: #c0392b; }
    .value { font-variant-numeric: tabular-nums; font-weight: 600; }
    .partial { color: #e67e22; font-size: 0.9rem; }
    .asof { font-size: 0.8rem; opacity: 0.6; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <main>
    <div class="score">${scoreText}</div>
    <p class="label">${esc(result.label)}</p>
    ${partialNote}
    <ul>${rows}</ul>
    <p class="asof">As of ${esc(result.asOf)} · reload to refresh</p>
  </main>
</body>
</html>`;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test render`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/render.ts tests/render.test.ts
git commit -m "feat: minimal HTML render (score + 3 signal rows)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: The two endpoints

**Files:**
- Create: `api/score.ts`, `api/index.ts`

No unit tests — thin Vercel handlers verified live in Task 8.

- [ ] **Step 1: Implement `api/score.ts`**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runPipeline } from '../lib/pipeline.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const result = await runPipeline();
  if (result.score === null) {
    res.status(502).json({ error: 'all_sources_failed', ...result });
    return;
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.status(200).json(result);
}
```

- [ ] **Step 2: Implement `api/index.ts`**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runPipeline } from '../lib/pipeline.js';
import { renderHtml } from '../lib/render.js';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const result = await runPipeline();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.status(200).send(renderHtml(result));
}
```

- [ ] **Step 3: Typecheck + full test run**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm typecheck && pnpm test`
Expected: PASS — no type errors, all unit tests green.

- [ ] **Step 4: Commit**

```bash
git add api/score.ts api/index.ts
git commit -m "feat: GET /api/score (JSON) and GET / (HTML) endpoints

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Update repo docs to match the new shape

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `specs/001-market-sentiment-score/HANDOFF.md`

- [ ] **Step 1: Update `HANDOFF.md` §2 and §5** to state the single-Vercel-app, stateless, 3-signal Yahoo+CNN Phase-1 architecture (delete Cloudflare/D1/sidecar/TradingView/frontend references; point at `simplification-design.md` and this plan). Note S5FI deferred to Phase 2. Keep under ~300 lines. Bump date to 2026-06-11.

- [ ] **Step 2: Update `README.md`** quickstart to the single app: `pnpm install`, `pnpm test`, `pnpm typecheck`, `vercel --prod`. Remove Cloudflare/Wrangler/D1/TradingView-sidecar instructions.

- [ ] **Step 3: Update `CLAUDE.md`** "Full feature context" list to add `simplification-design.md` as the Phase-1 source of truth.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md specs/001-market-sentiment-score/HANDOFF.md
git commit -m "docs: update HANDOFF/README/CLAUDE for single Vercel app (Phase 1)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Install, deploy, and verify live  ⚠️ ASK FIRST

**This task runs commands with network/runtime side effects. Per owner preference ("keep the Mac quiet"), STOP and ask before each of Steps 1, 3, 4, and 5.**

- [ ] **Step 1: Install dependencies** (ASK FIRST)

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm install`
Expected: lockfile resolves `zod`, `@vercel/node`, `vitest`, `typescript`. (No market-data dep.)

- [ ] **Step 2: Run the full unit suite + typecheck locally**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Deploy to Vercel prod** (ASK FIRST — opens browser OAuth on first run; confirm `omer815`/correct Vercel account)

Run: `cd /Users/omermircor/personal/dashboard/dashboard && vercel --prod`
Expected: prints a `https://<project>.vercel.app` URL.

- [ ] **Step 4: Verify live** (ASK FIRST)

```bash
curl -s https://<project>.vercel.app/api/score | jq .
```
Expected: JSON with `score` ∈ {0,33,67,100} and 3 signals. Then open the root URL and confirm the HTML renders the score + 3 rows.

If Yahoo returns an error, try the symbol fallbacks in `lib/fetchers.ts` (`^VIX`/`^GSPC` are already URL-encoded; if blocked, switch host to `query2.finance.yahoo.com`). If CNN 403s, confirm the `User-Agent` header is being sent.

- [ ] **Step 5: Push the branch + fast-forward main** (ASK FIRST — network)

```bash
cd /Users/omermircor/personal/dashboard/dashboard
git push origin 001-market-sentiment-score
git branch -f main 001-market-sentiment-score
git push origin main
```

---

## Self-review notes (author)

- **Spec coverage:** Scoring → Task 2 (now 3 signals, 0/33/67/100). Data sources (Yahoo VIX + S&P, CNN F&G) → Task 3. Partial handling (failed source → 0, `partial`, denominator stays 3) → Task 2 tests + pipeline. Score+flags UI → Task 5/6. JSON contract → Task 4/6. Deploy to prod → Task 8. S5FI + persistence/history → explicitly out of scope (Phase 2).
- **Type consistency:** `PipelineInputs` (vix/fg/sp500), `ScoreResult`, `Signal`, `CompositeScore` (0|33|67|100), `SignalKey` ('vix'|'fg'|'sp500'), `TOTAL_SIGNALS`=3 defined once in `lib/types.ts` and used identically in `score.ts`, `pipeline.ts`, `render.ts`, endpoints. `buildScoreResult(inputs,cfg,asOf)`, `parseYahooChart(json)`, `parseDaily(bars, nowMs?)`, `parseCnn(json)` signatures match their tests and callers.
- **No placeholders:** every code step contains full source; no TBD/TODO; no TradingView/WebSocket references remain.
```
