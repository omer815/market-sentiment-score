# Market Sentiment Score — Phase 1 Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the market-sentiment app into a single stateless Vercel project that fetches 4 market signals live, scores them, and serves both a JSON contract (`GET /api/score`) and a minimal HTML page (`GET /`).

**Architecture:** One Vercel app at the repo root. No database, no second provider, no build framework. Two serverless functions (`api/score.ts`, `api/index.ts`) call a shared in-process pipeline (`lib/pipeline.ts`) that fans out to 4 fetchers via `Promise.allSettled`, scores with `lib/score.ts`, and returns a `ScoreResult`. Per-source failure contributes 0 points and marks the result `partial`. The old `backend/`, `frontend/`, `scripts/` trees are deleted (git history preserves them).

**Tech Stack:** Node ≥20 (ESM, `"type": "module"`), TypeScript 5.5 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `moduleResolution: Bundler`, `.js` import specifiers), `@vercel/node` runtime, `@mathieuc/tradingview` 3.5.0, `zod`, `vitest`.

Reference design: `specs/001-market-sentiment-score/simplification-design.md`. Product/scoring rules: `spec.md` FR-005.

---

## File structure (after this plan)

```
market-sentiment-score/            (repo root = the Vercel app)
├─ api/
│  ├─ score.ts        GET /api/score → ScoreResult JSON + Cache-Control
│  └─ index.ts        GET /          → minimal HTML page
├─ lib/
│  ├─ config.ts       zod ScoringConfig from env (thresholds)
│  ├─ types.ts        ScoreResult, Signal, PipelineInputs, CompositeScore
│  ├─ score.ts        flag eval + redDayTailStreak + buildScoreResult + labelForScore
│  ├─ tradingview.ts  getQuote / getCandles (WS wrapper, ported verbatim)
│  ├─ fetchers.ts     fetchVix/fetchS5fi/fetchSp500Daily/fetchCnnFearAndGreed (+ parseDaily, parseCnn)
│  ├─ pipeline.ts     runPipeline(): allSettled 4 fetchers → buildScoreResult
│  └─ render.ts       renderHtml(result) → HTML string
├─ tests/
│  ├─ score.test.ts   flags, streak, composite, buildScoreResult, labelForScore
│  ├─ fetchers.test.ts parseDaily + parseCnn (pure parsers)
│  └─ render.test.ts  renderHtml normal + partial
├─ package.json
├─ tsconfig.json
├─ vercel.json
└─ .gitignore
```

`lib/tradingview.ts`, the network bodies of `lib/fetchers.ts`, and the two `api/*.ts` endpoints are **not** unit-tested — they need live TradingView/CNN and are verified manually post-deploy (Task 8). Only the pure logic is tested.

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

Expected: git stages the deletions. (History keeps them; this is the agreed restructure-in-place.)

- [ ] **Step 2: Replace root `package.json`**

```json
{
  "name": "market-sentiment-score",
  "private": true,
  "version": "0.2.0",
  "type": "module",
  "description": "Stateless market sentiment buy/sell score (VIX, CNN F&G, S&P 500, S5FI) on a single Vercel app.",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@mathieuc/tradingview": "3.5.0",
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

## Task 2: Port the scoring logic (the core, fully tested)

**Files:**
- Create: `lib/config.ts`, `lib/types.ts`, `lib/score.ts`
- Test: `tests/score.test.ts`

- [ ] **Step 1: Create `lib/config.ts` (ported verbatim from `backend/src/config.ts`)**

```typescript
import { z } from 'zod';

const numFromString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : Number(v)))
  .refine((n) => Number.isFinite(n), { message: 'must be a finite number' });

const ConfigSchema = z.object({
  VIX_THRESHOLD: numFromString.default(30),
  FG_THRESHOLD: numFromString.default(20),
  S5FI_THRESHOLD: numFromString.default(20),
  SP500_RED_DAYS_MIN: numFromString
    .default(3)
    .refine((n) => Number.isInteger(n) && n >= 1, { message: 'must be a positive integer' }),
});

export type ScoringConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, unknown>): ScoringConfig {
  return ConfigSchema.parse({
    VIX_THRESHOLD: env['VIX_THRESHOLD'],
    FG_THRESHOLD: env['FG_THRESHOLD'],
    S5FI_THRESHOLD: env['S5FI_THRESHOLD'],
    SP500_RED_DAYS_MIN: env['SP500_RED_DAYS_MIN'],
  });
}
```

- [ ] **Step 2: Create `lib/types.ts`**

```typescript
export type CompositeScore = 0 | 25 | 50 | 75 | 100;

export type SignalKey = 'vix' | 'fg' | 's5fi' | 'sp500';

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

// One per source; the streak for sp500 is computed in buildScoreResult, so
// the pipeline supplies raw closes here.
export interface PipelineInputs {
  vix: { ok: true; raw: number } | { ok: false };
  fg: { ok: true; raw: number } | { ok: false };
  s5fi: { ok: true; raw: number } | { ok: false };
  sp500: { ok: true; closes: number[] } | { ok: false };
}
```

- [ ] **Step 3: Write the failing tests `tests/score.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';
import {
  redDayTailStreak,
  buildScoreResult,
  labelForScore,
} from '../lib/score.js';
import type { PipelineInputs } from '../lib/types.js';

const cfg = loadConfig({}); // defaults: VIX>30, FG<20, S5FI<20, streak>=3
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
    expect(labelForScore(100)).toBe('Maximum buy signal');
    expect(labelForScore(null)).toBe('No data');
  });
});

describe('buildScoreResult', () => {
  const allInputs = (o: Partial<PipelineInputs> = {}): PipelineInputs => ({
    vix: { ok: true, raw: 35 },
    fg: { ok: true, raw: 15 },
    s5fi: { ok: true, raw: 16 },
    sp500: { ok: true, closes: [10, 9, 8, 7] },
    ...o,
  });

  it('scores 100 when all four flags trigger', () => {
    const r = buildScoreResult(allInputs(), cfg, AS_OF);
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.signals.every((s) => s.triggered && s.available)).toBe(true);
  });

  it('scores 0 when no flag triggers', () => {
    const r = buildScoreResult(
      allInputs({
        vix: { ok: true, raw: 12 },
        fg: { ok: true, raw: 60 },
        s5fi: { ok: true, raw: 80 },
        sp500: { ok: true, closes: [7, 8, 9, 10] },
      }),
      cfg,
      AS_OF,
    );
    expect(r.score).toBe(0);
    expect(r.label).toBe('No signal');
  });

  it('marks partial and drops failed sources to 0 points', () => {
    const r = buildScoreResult(allInputs({ vix: { ok: false } }), cfg, AS_OF);
    expect(r.partial).toBe(true);
    expect(r.score).toBe(75); // fg+s5fi+sp500 trigger; vix unavailable -> 0
    const vix = r.signals.find((s) => s.key === 'vix')!;
    expect(vix.available).toBe(false);
    expect(vix.triggered).toBe(false);
    expect(vix.value).toBeNull();
  });

  it('returns null score and No data when every source fails', () => {
    const r = buildScoreResult(
      { vix: { ok: false }, fg: { ok: false }, s5fi: { ok: false }, sp500: { ok: false } },
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
Expected: FAIL — `Cannot find module '../lib/score.js'` (not written yet).

- [ ] **Step 5: Implement `lib/score.ts`**

```typescript
import type { ScoringConfig } from './config.js';
import type {
  CompositeScore,
  PipelineInputs,
  ScoreResult,
  Signal,
} from './types.js';

export const POINTS_ON_TRIGGER = 25;

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
    case 25:
      return 'Weak buy signal';
    case 50:
      return 'Moderate buy signal';
    case 75:
      return 'Strong buy signal';
    case 100:
      return 'Maximum buy signal';
  }
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
    buildScalar('s5fi', 'S5FI', inputs.s5fi, `S5FI < ${cfg.S5FI_THRESHOLD}`, (raw) => raw < cfg.S5FI_THRESHOLD),
    buildSp500(inputs.sp500, cfg),
  ];

  const available = signals.filter((s) => s.available);
  const partial = available.length < signals.length;

  if (available.length === 0) {
    return { score: null, label: labelForScore(null), partial: true, asOf, signals };
  }

  const sum = available.reduce((acc, s) => acc + (s.triggered ? POINTS_ON_TRIGGER : 0), 0);
  const score = sum as CompositeScore; // multiple of 25 in [0,100] by construction
  return { score, label: labelForScore(score), partial, asOf, signals };
}

function buildScalar(
  key: 'vix' | 'fg' | 's5fi',
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
git commit -m "feat: port scoring logic (flags, streak, composite) into lib/score

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Port the data fetchers (with pure-parser tests)

**Files:**
- Create: `lib/tradingview.ts`, `lib/fetchers.ts`
- Test: `tests/fetchers.test.ts`

- [ ] **Step 1: Create `lib/tradingview.ts` (ported verbatim from `scripts/tradingview-sidecar/src/tradingview.ts`)**

Copy the file `scripts/tradingview-sidecar/src/tradingview.ts` content exactly (the `getQuote` + `getCandles` WS wrapper shown in the design reference). It has no internal imports, so it ports unchanged. It exports `getQuote(symbol, timeoutMs?)`, `getCandles(symbol, timeframe, limit, timeoutMs?)`, and the `TvCandle` interface.

- [ ] **Step 2: Write the failing parser tests `tests/fetchers.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { parseDaily, parseCnn } from '../lib/fetchers.js';

const NOW = Date.parse('2026-06-11T14:00:00Z');

describe('parseDaily', () => {
  const day = (n: number) => Math.floor(Date.parse(`2026-06-${String(n).padStart(2, '0')}T00:00:00Z`) / 1000);

  it('drops the still-forming candle (within 12h) and returns completed closes oldest-first', () => {
    const bars = [
      { ts: day(8), close: 100 },
      { ts: day(9), close: 99 },
      { ts: day(10), close: 98 },
      { ts: Math.floor(NOW / 1000) - 3600, close: 97 }, // today, unfinished -> dropped
    ];
    const out = parseDaily(bars, '2026-06-11T14:00:00Z', NOW);
    expect(out.closes).toEqual([100, 99, 98]);
    expect(out.latest_date).toBe('2026-06-10');
  });

  it('throws when fewer than 2 completed bars', () => {
    expect(() => parseDaily([{ ts: day(10), close: 98 }], '2026-06-11T14:00:00Z', NOW)).toThrow();
  });
});

describe('parseCnn', () => {
  it('extracts the fear & greed score', () => {
    const r = parseCnn({ fear_and_greed: { score: 41.2 } }, '2026-06-11T14:00:00Z');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.raw).toBeCloseTo(41.2);
  });

  it('fails when no usable score', () => {
    const r = parseCnn({ fear_and_greed: {} }, '2026-06-11T14:00:00Z');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test fetchers`
Expected: FAIL — `Cannot find module '../lib/fetchers.js'`.

- [ ] **Step 4: Implement `lib/fetchers.ts`**

This merges the three TradingView fetchers and the CNN fetcher into one module. The `parseDaily`/`parseCnn` pure parsers are exported for the tests; the network entry points (`fetchVix` etc.) wrap them.

```typescript
import { getQuote, getCandles } from './tradingview.js';

// ---- TradingView symbols (with documented fallbacks in HANDOFF §8) ----
const VIX_SYMBOL = 'CBOE:VIX';
const S5FI_SYMBOL = 'INDEX:S5FI';
const SP500_SYMBOL = 'CBOE:SPX';
const SP500_BARS = 10;

export async function fetchVix(): Promise<{ raw: number }> {
  const raw = await getQuote(VIX_SYMBOL);
  return { raw };
}

export async function fetchS5fi(): Promise<{ raw: number }> {
  const raw = await getQuote(S5FI_SYMBOL);
  return { raw: Math.max(0, Math.min(100, raw)) };
}

export interface Sp500Daily {
  closes: number[];
  latest_date: string;
}

export async function fetchSp500Daily(): Promise<Sp500Daily> {
  const candles = await getCandles(SP500_SYMBOL, 'D', SP500_BARS);
  return parseDaily(
    candles.map((c) => ({ ts: c.time, close: c.close })),
    new Date().toISOString(),
  );
}

// Pure. Drops any bar within the last 12h (today's unfinished candle).
export function parseDaily(
  bars: Array<{ ts: number; close: number }>,
  _fetchedAt: string,
  nowMs: number = Date.now(),
): Sp500Daily {
  const cutoff = nowMs / 1000 - 12 * 60 * 60;
  const completed = bars
    .filter((b) => Number.isFinite(b.close) && b.ts < cutoff)
    .sort((a, b) => a.ts - b.ts);

  if (completed.length < 2) {
    throw new Error(`S&P 500 daily: not enough completed bars (${completed.length})`);
  }
  const closes = completed.map((b) => b.close);
  const latestTs = completed[completed.length - 1]!.ts;
  const latest_date = new Date(latestTs * 1000).toISOString().slice(0, 10);
  return { closes, latest_date };
}

// ---- CNN Fear & Greed (direct HTTPS, browser-shaped UA required) ----
const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

export type CnnParse = { ok: true; raw: number } | { ok: false; error: string };

export async function fetchCnnFearAndGreed(fetchImpl: typeof fetch = fetch): Promise<CnnParse> {
  try {
    const res = await fetchImpl(CNN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (market-sentiment-dashboard)',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `CNN F&G HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    return parseCnn(await res.json(), new Date().toISOString());
  } catch (err) {
    return { ok: false, error: `CNN F&G: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Pure.
export function parseCnn(json: unknown, _fetchedAt: string): CnnParse {
  const score = (json as { fear_and_greed?: { score?: number } })?.fear_and_greed?.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return { ok: false, error: 'CNN F&G: no usable score in response' };
  }
  return { ok: true, raw: score };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm test fetchers`
Expected: PASS — `parseDaily` + `parseCnn` cases green.

- [ ] **Step 6: Commit**

```bash
git add lib/tradingview.ts lib/fetchers.ts tests/fetchers.test.ts
git commit -m "feat: port TradingView + CNN fetchers into lib/fetchers (in-process)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: The pipeline (fan-out + score)

**Files:**
- Create: `lib/pipeline.ts`

The pipeline is a thin orchestration over `Promise.allSettled` + `buildScoreResult`. Both are already tested in isolation, so this task ports glue and relies on Task 2's `buildScoreResult` tests plus manual verification in Task 8. No new unit test (it only does network + already-tested mapping).

- [ ] **Step 1: Implement `lib/pipeline.ts`**

```typescript
import { loadConfig } from './config.js';
import {
  fetchVix,
  fetchS5fi,
  fetchSp500Daily,
  fetchCnnFearAndGreed,
} from './fetchers.js';
import { buildScoreResult } from './score.js';
import type { PipelineInputs, ScoreResult } from './types.js';

// Fan out to all four sources in parallel; a rejected source becomes {ok:false}
// and contributes 0 points (buildScoreResult marks the result partial).
export async function runPipeline(env: Record<string, unknown> = process.env): Promise<ScoreResult> {
  const cfg = loadConfig(env);
  const asOf = new Date().toISOString();

  const [vix, s5fi, sp500, fg] = await Promise.allSettled([
    fetchVix(),
    fetchS5fi(),
    fetchSp500Daily(),
    fetchCnnFearAndGreed(),
  ]);

  const inputs: PipelineInputs = {
    vix: vix.status === 'fulfilled' ? { ok: true, raw: vix.value.raw } : { ok: false },
    s5fi: s5fi.status === 'fulfilled' ? { ok: true, raw: s5fi.value.raw } : { ok: false },
    sp500: sp500.status === 'fulfilled' ? { ok: true, closes: sp500.value.closes } : { ok: false },
    fg: fg.status === 'fulfilled' && fg.value.ok ? { ok: true, raw: fg.value.raw } : { ok: false },
  };

  return buildScoreResult(inputs, cfg, asOf);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline.ts
git commit -m "feat: add in-process pipeline (allSettled fan-out -> buildScoreResult)

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
  score: 75,
  label: 'Strong buy signal',
  partial: false,
  asOf: '2026-06-11T14:00:00Z',
  signals: [
    { key: 'vix', label: 'VIX', triggered: true, value: 34.2, available: true, rule: 'VIX > 30' },
    { key: 'fg', label: 'Fear & Greed', triggered: false, value: 41, available: true, rule: 'F&G < 20' },
    { key: 's5fi', label: 'S5FI', triggered: true, value: 16, available: true, rule: 'S5FI < 20' },
    { key: 'sp500', label: 'S&P 500 streak', triggered: false, value: 1, available: true, rule: '>= 3 consecutive red days' },
  ],
};

describe('renderHtml', () => {
  it('shows the score, label, and a row per signal', () => {
    const html = renderHtml(base);
    expect(html).toContain('75');
    expect(html).toContain('Strong buy signal');
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

// Red -> green across the 5 discrete stops. Index by score/25.
const STOP_COLORS: Record<number, string> = {
  0: '#c0392b',
  25: '#e67e22',
  50: '#f1c40f',
  75: '#7dcea0',
  100: '#27ae60',
};

function colorFor(score: CompositeScore | null): string {
  if (score === null) return '#7f8c8d';
  return STOP_COLORS[score] ?? '#7f8c8d';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
git commit -m "feat: minimal HTML render (score + 4 signal rows)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: The two endpoints

**Files:**
- Create: `api/score.ts`, `api/index.ts`

No unit tests — these are thin Vercel handlers verified live in Task 8.

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
git commit -m "feat: add GET /api/score (JSON) and GET / (HTML) endpoints

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Update repo docs to match the new shape

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `specs/001-market-sentiment-score/HANDOFF.md`

- [ ] **Step 1: Update `HANDOFF.md` §2 and §5** to state the single-Vercel-app, stateless Phase-1 architecture (delete the Cloudflare/D1/sidecar/frontend references; point at `simplification-design.md` and this plan). Keep it under ~300 lines. Bump the date to 2026-06-11.

- [ ] **Step 2: Update `README.md`** quickstart to the single app: `pnpm install`, `pnpm test`, `pnpm typecheck`, and `vercel --prod` for deploy. Remove Cloudflare/Wrangler/D1 instructions.

- [ ] **Step 3: Update `CLAUDE.md`** "Full feature context" list to add `simplification-design.md` as the Phase-1 source of truth.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md specs/001-market-sentiment-score/HANDOFF.md
git commit -m "docs: update HANDOFF/README/CLAUDE for single Vercel app (Phase 1)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Install, deploy, and verify live  ⚠️ ASK FIRST

**This task runs commands with network/runtime side effects. Per owner preference ("keep the Mac quiet"), STOP and ask before each of Steps 1, 3, and 4.**

- [ ] **Step 1: Install dependencies** (ASK FIRST)

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm install`
Expected: lockfile resolves `@mathieuc/tradingview`, `zod`, `@vercel/node`, `vitest`.

- [ ] **Step 2: Run the full unit suite locally**

Run: `cd /Users/omermircor/personal/dashboard/dashboard && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Deploy to Vercel prod** (ASK FIRST — opens browser OAuth on first run)

Run: `cd /Users/omermircor/personal/dashboard/dashboard && vercel --prod`
Expected: prints a `https://<project>.vercel.app` URL. Confirm it deploys under the correct Vercel account.

- [ ] **Step 4: Verify live** (ASK FIRST)

```bash
curl -s https://<project>.vercel.app/api/score | jq .
```
Expected: JSON with a `score` ∈ {0,25,50,75,100} and 4 signals. Then open the root URL in a browser and confirm the HTML page renders the score + 4 rows.

If TradingView returns "Symbol not found", edit `lib/fetchers.ts` symbols to the fallbacks (`TVC:VIX`, `SP:SPX`, bare `S5FI`), re-run tests, redeploy.

- [ ] **Step 5: Push the branch + fast-forward main** (ASK FIRST — network)

```bash
cd /Users/omermircor/personal/dashboard/dashboard
git push origin 001-market-sentiment-score
git branch -f main 001-market-sentiment-score
git push origin main
```

---

## Self-review notes (author)

- **Spec coverage:** Scoring rules (FR-005) → Task 2. 4 data sources → Task 3. Partial handling (failed source → 0, `partial`) → Task 2 tests + pipeline. Score+4-flags UI → Task 5/6. JSON contract (design §5) → Task 4/6. Deploy to prod (the session goal) → Task 8. Persistence/history → explicitly out of scope (Phase 2).
- **Type consistency:** `PipelineInputs`, `ScoreResult`, `Signal`, `CompositeScore`, `SignalKey` defined once in `lib/types.ts` and used identically in `score.ts`, `pipeline.ts`, `render.ts`, endpoints. `buildScoreResult(inputs, cfg, asOf)` signature matches its test and its caller. `parseDaily(bars, fetchedAt, nowMs?)` and `parseCnn(json, fetchedAt)` match tests.
- **No placeholders:** every code step contains full source; no TBD/TODO.
```
