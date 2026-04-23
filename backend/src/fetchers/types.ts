import type { FetchStatus } from '../lib/errors.js';

export type SourceId = 'vix' | 'cnn_fg' | 'sp500' | 's5fi';

export const ALL_SOURCES: ReadonlyArray<SourceId> = ['vix', 'cnn_fg', 'sp500', 's5fi'];

export interface FetchSuccess<T> {
  status: 'ok' | 'stale-source';
  value: T;
  fetched_at: string;
  error?: never;
}

export interface FetchFailed {
  status: Exclude<FetchStatus, 'ok' | 'stale-source'>;
  value?: never;
  fetched_at: string;
  error: string;
}

export type FetchResult<T> = FetchSuccess<T> | FetchFailed;

export interface Sp500DailyPayload {
  /** Most recent completed daily closes, oldest-first. */
  closes: number[];
  /** Date (YYYY-MM-DD UTC) of the most recent completed close. */
  latestDate: string;
}

export type VixPayload = { raw: number };
export type CnnFgPayload = { raw: number };
export type S5fiPayload = { raw: number };
