import type { SnapshotStatus, SourceId } from './api-types.js';

/** Single source of truth for user-facing strings. No component may hard-code copy. */
export const copy = {
  app: {
    title: 'Market Sentiment Score',
    subtitle: 'A 0–100 buy/sell score from four sources. Click Refresh to pull fresh data.',
    dataFootnote: 'Data: TradingView (VIX / S&P 500 / S5FI) and CNN dataviz (Fear & Greed).',
  },
  composite: {
    label: {
      0: 'Calm — no defensive flags triggered',
      25: 'One defensive flag triggered',
      50: 'Two defensive flags triggered — caution',
      75: 'Three defensive flags triggered — elevated stress',
      100: 'Four defensive flags triggered — extreme stress',
    } as Record<0 | 25 | 50 | 75 | 100, string>,
    ariaLabel: 'Composite market-sentiment score',
  },
  flag: {
    vix: { name: 'VIX', rule: 'VIX > 30' },
    cnn_fg: { name: 'CNN Fear & Greed', rule: 'CNN F&G < 20' },
    s5fi: { name: 'S&P 500 above 50-DMA (S5FI)', rule: 'S5FI < 20' },
    sp500: { name: 'S&P 500 daily streak', rule: '≥ 3 consecutive red daily closes' },
  } as Record<SourceId, { name: string; rule: string }>,
  flagState: {
    ok: 'Live',
    triggered: 'Flag',
    missing: 'Missing data',
    stale: 'Stale',
  },
  snapshot: {
    status: {
      complete: 'Complete',
      partial: 'Partial — one or more sources failed',
      'no-data': 'No data — all sources failed',
    } as Record<SnapshotStatus, string>,
  },
  badge: {
    partial: (n: number) => `Partial · ${n} source${n === 1 ? '' : 's'}`,
    partialTitle: (names: string) => `Missing data from: ${names}`,
    partialAria: (names: string) => `Partial snapshot — missing ${names}`,
  },
  lastRefreshed: {
    prefix: 'Last refreshed',
    ariaLabel: (rel: string) => `Last refreshed ${rel}`,
  },
  refresh: {
    idle: 'Refresh',
    busy: 'Refreshing…',
    success: 'Up to date',
    errorLabel: 'Refresh failed',
    errorGeneric: "Couldn't refresh the score. Try again?",
    ariaLabel: 'Fetch a new snapshot now',
  },
  empty: {
    // Shown before the first snapshot exists in the database. The Dashboard
    // auto-triggers one /refresh on mount in this case, so this copy is what
    // the user sees briefly while the first refresh runs.
    firstLoad: 'Fetching the first snapshot…',
    firstLoadFailed: "Couldn't reach the data sources. Try Refresh again.",
  },
  errors: {
    generic: 'Something went wrong loading the latest score.',
  },
} as const;

/** Canonical order for display — driver logic must rely on this. */
export const SOURCE_ORDER: ReadonlyArray<SourceId> = ['vix', 'cnn_fg', 's5fi', 'sp500'];
