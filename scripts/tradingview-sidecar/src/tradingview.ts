/**
 * Thin promise-based wrapper over `@mathieuc/tradingview` so the fetchers can
 * do a single async call per symbol without juggling event listeners.
 *
 * The upstream package is unofficial and uses TradingView's reverse-engineered
 * WebSocket protocol. Field names (`lp` for last price, `periods[*].close`,
 * etc.) are stable at the time of writing but not documented; if TradingView
 * changes the protocol, these selectors may need updating.
 */

// The package ships no .d.ts — treat the default export as a loose record.
// Don't import via types-only — the runtime value is needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import TradingView from '@mathieuc/tradingview';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface TvCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Fetch the current "last price" quote for a symbol (e.g. `CBOE:VIX`, `INDEX:S5FI`).
 */
export async function getQuote(symbol: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const client: any = new (TradingView as any).Client();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        client.end();
      } catch {
        /* ignore */
      }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`TradingView quote timeout for ${symbol}`)));
    }, timeoutMs);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const session = new client.Session.Quote();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const market = new session.Market(symbol);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      market.onData((data: Record<string, unknown>) => {
        const lp = data['lp'];
        if (typeof lp === 'number' && Number.isFinite(lp)) {
          clearTimeout(timer);
          finish(() => resolve(lp));
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      market.onError((err: unknown) => {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        finish(() => reject(new Error(`TradingView ${symbol}: ${msg}`)));
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      finish(() => reject(new Error(`TradingView ${symbol} setup failed: ${msg}`)));
    }
  });
}

/**
 * Fetch the most recent `limit` bars for a symbol at a given timeframe.
 * `timeframe`: `'1'`, `'5'`, `'15'`, `'30'`, `'60'`, `'240'`, `'D'`, `'W'`, `'M'`.
 * Bars are returned oldest-first.
 */
export async function getCandles(
  symbol: string,
  timeframe: string,
  limit: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TvCandle[]> {
  return new Promise<TvCandle[]>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const client: any = new (TradingView as any).Client();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        client.end();
      } catch {
        /* ignore */
      }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`TradingView chart timeout for ${symbol} @ ${timeframe}`)));
    }, timeoutMs);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const chart = new client.Session.Chart();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      chart.setMarket(symbol, { timeframe, range: limit + 5 });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      chart.onUpdate(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const periods: unknown = chart.periods;
        if (!Array.isArray(periods) || periods.length === 0) return;

        const candles: TvCandle[] = [];
        for (const p of periods as Array<Record<string, unknown>>) {
          const t = p['time'];
          const o = p['open'];
          const h = p['max'] ?? p['high'];
          const l = p['min'] ?? p['low'];
          const c = p['close'];
          const v = p['volume'];
          if (
            typeof t === 'number' &&
            typeof o === 'number' &&
            typeof h === 'number' &&
            typeof l === 'number' &&
            typeof c === 'number' &&
            Number.isFinite(c)
          ) {
            candles.push({
              time: t,
              open: o,
              high: h,
              low: l,
              close: c,
              ...(typeof v === 'number' ? { volume: v } : {}),
            });
          }
        }

        candles.sort((a, b) => a.time - b.time);
        clearTimeout(timer);
        finish(() => resolve(candles.slice(-limit)));
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      chart.onError((err: unknown) => {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        finish(() => reject(new Error(`TradingView ${symbol}: ${msg}`)));
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      finish(() => reject(new Error(`TradingView ${symbol} setup failed: ${msg}`)));
    }
  });
}
