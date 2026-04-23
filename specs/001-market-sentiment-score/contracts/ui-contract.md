# UI States Contract

**Feature**: Market Sentiment Score Dashboard
**Purpose**: Enumerate the UI states every data-backed view MUST implement
per Constitution Principle III ("Loading, empty, error, and success states
MUST be handled explicitly for every data-backed view").

Every view below lists: **State**, **Trigger**, **Render contract**.

---

## View: Dashboard (`/`) — User Story 1

Two primary components on this view:

1. `<CompositeHeatmap>` — the red-to-green score display (FR-016)
2. `<ScoringBreakdown>` — per-flag ✓/✗ rows (FR-017)

| State | Trigger | Render contract |
|---|---|---|
| **Loading (initial)** | `GET /api/snapshots/latest` pending | Skeletons for heatmap and 4 flag rows; `aria-busy="true"`. No layout shift on data arrival. |
| **Empty** | HTTP 204 from `/api/snapshots/latest` | `<EmptyState>` with copy from `copy.ts` key `dashboard.empty`: *"The first fetch hasn't completed yet. Check back in a few minutes."* |
| **Success (complete)** | 200 with `status = complete` | Heatmap renders at the exact composite (one of {0, 25, 50, 75, 100}); 4 flag rows show rule, raw value, ✓/✗, and points. |
| **Success (partial)** | 200 with `status = partial` | Heatmap renders at the composite; `<PartialBadge>` names the failed sources; failed flag rows render in "not evaluated" state (distinct from ✗). |
| **Success (no-data)** | 200 with `status = no-data` | Heatmap shows em-dash and grey bar; `<PartialBadge status="no-data">`; all 4 flag rows in "not evaluated". |
| **Stale** | `fetched_at` > 90 min ago | `<StaleBadge>` banner top-of-page: *"Data is stale — last successful fetch {relative time} ago."* |
| **Error (network)** | fetch threw / 5xx | `<ErrorState>` with retry button; heatmap and rows hidden. Copy: *"Couldn't reach the dashboard right now. Try again?"* |

### `<CompositeHeatmap>` render contract

- A horizontal bar with 5 equal cells at stops `0 · 25 · 50 · 75 · 100`,
  coloured with a sequential red → green gradient:

  | Stop | Colour (token) | Semantic |
  |---|---|---|
  | 0   | `--heatmap-0` (red — e.g., `#d13438`) | Strong sell / caution |
  | 25  | `--heatmap-25` (orange — e.g., `#e57b38`) | Lean sell |
  | 50  | `--heatmap-50` (yellow — e.g., `#e8c547`) | Neutral |
  | 75  | `--heatmap-75` (yellow-green — e.g., `#7ab647`) | Lean buy |
  | 100 | `--heatmap-100` (green — e.g., `#2ea043`) | Strong buy |

- The cell corresponding to the current composite is visually emphasised
  (filled), other cells rendered at lower opacity.
- Accompanied by:
  - Numeric value rendered large (`55px` / H1-equivalent): e.g., `"75"`.
  - Text label below: `"Strong buy"` (100), `"Lean buy"` (75),
    `"Neutral"` (50), `"Lean sell"` (25), `"Caution"` (0), stored under
    `copy.ts` key `composite.label.{0|25|50|75|100}`.
  - `aria-label="Composite score {value} out of 100, {label}"` on the
    container (WCAG 2.1 AA — colour-independent state indication per
    Principle III).

### `<ScoringBreakdown>` render contract

- Renders exactly 4 `<FlagRow>` items in a fixed, stable order:
  `vix`, `cnn_fg`, `s5fi`, `sp500`.
- Each row displays:
  - Source display name (from `copy.ts`)
  - Flag rule (from `SourceMetadata.flag_rule`)
  - Current raw value (formatted per source: VIX → 1 decimal,
    F&G → integer, S5FI → 1 decimal %, S&P 500 → daily streak length
    "N red days in a row")
  - State indicator: ✓ (triggered) / ✗ (not triggered) / `⚠ not
    evaluated` (fetch failed)
  - Points contribution: `+25` / `+0` / `—`
- Rows never reflow in size when state changes (avoid CLS).
- Full row is focusable (`tabindex=0`) and has `aria-label` combining
  rule, raw value, and state for screen readers.

Polling: TanStack Query `refetchInterval = 60_000`, refetch on window
focus.

---

## View: History (`/history`) — User Story 3

| State | Trigger | Render contract |
|---|---|---|
| **Loading** | `GET /api/snapshots?from&to` pending | Chart skeleton (fixed height 360 px) with axis labels visible; no layout shift. |
| **Empty** | 200 with `points: []` | `<EmptyState>` copy: *"No data in this range yet."* Range selector remains interactive. |
| **Success** | 200 with `points: [...]` | Recharts `LineChart`: one line for composite, toggleable lines per source; x-axis in user's local tz with time-range-appropriate labelling; y-axis `0–100`; legend explaining scale. Failure gaps rendered as broken line segments (per US3 AS2). |
| **Success with gaps** | Any `status = 'no-data'` point in the range | Broken-line segments around `no-data` points; hover tooltip labels the gap *"No sources reported at HH:mm"*. |
| **Success (aggregated)** | Server returned `resolution != raw` | Caption under chart: *"Showing {resolution} averages for ranges longer than {threshold}."* |
| **Error** | fetch threw / 5xx | `<ErrorState>` with retry; range selector preserved. |
| **Range-invalid** | 400 from backend | Inline validation on range control; no chart redraw. |

Also on the History page: the **S&P 500 Candles** panel (`Sp500CandleChart`)
renders using the sp500 readings from the same range. Its states mirror the
above.

---

## Copy & terminology consistency

All UI strings live in `frontend/src/lib/copy.ts`. Required keys:

- `composite.heading` — "Buy/Sell Score"
- `composite.scale` — "0 = caution · 100 = strong buy"
- `composite.label.0` — "Caution"
- `composite.label.25` — "Lean sell"
- `composite.label.50` — "Neutral"
- `composite.label.75` — "Lean buy"
- `composite.label.100` — "Strong buy"
- `source.vix.name` — "CBOE VIX"
- `source.cnn_fg.name` — "CNN Fear & Greed"
- `source.sp500.name` — "S&P 500 (daily streak)"
- `source.s5fi.name` — "S&P 500 above 50-DMA (S5FI)"
- `flag.vix.rule` — "VIX > 30"
- `flag.cnn_fg.rule` — "CNN F&G < 20"
- `flag.s5fi.rule` — "S5FI < 20"
- `flag.sp500.rule` — "≥ 3 consecutive red daily closes"
- `flag.state.triggered` — "Triggered"
- `flag.state.notTriggered` — "Not triggered"
- `flag.state.notEvaluated` — "Not evaluated (fetch failed)"
- `dashboard.empty` — as above
- `history.empty` — as above
- `stale.banner` — as above
- `partial.badge` — "Partial — {n} of 4 sources reporting"

CI check: a lint rule (`no-restricted-syntax`) forbids hard-coded JSX text
in `src/components/**`; all text MUST come from `copy.ts`. Enforces the
"same entity is not called both 'project' and 'workspace'" clause of
Principle III.

---

## Accessibility (Principle III)

Every view above MUST:
- Achieve axe-core `serious`/`critical` = 0 in CI (runs on each Playwright
  test via `@axe-core/playwright`).
- Have visible focus indicators on every interactive element (tested via
  Playwright `page.focus()`).
- Label charts with `role="img"` and an `aria-label` describing the
  currently plotted series and range (Recharts + lightweight-charts need
  manual wrappers for this).
- Have colour-independent status indicators (icons + text, not just colour)
  for `complete` / `partial` / `no-data` AND for the heatmap score
  position (numeric value + text label accompany the colour per FR-016).

---

## Performance (Principle IV)

Per-view budgets, enforced by `lighthouserc.json`:

| View | TTI (p75) | JS transferred (gz) | LCP (p75) |
|---|---|---|---|
| Dashboard (`/`) | ≤ 2.5 s | ≤ 100 KB | ≤ 2.0 s |
| History (`/history`) | ≤ 2.5 s | ≤ 150 KB (incl. lightweight-charts) | ≤ 2.0 s |

Any PR that exceeds these by > 10% requires a Complexity Tracking entry in
`plan.md` per the constitution.
