export type SourceId = 'vix' | 'cnn_fg' | 'sp500' | 's5fi';

export type FetchStatus =
  | 'ok'
  | 'stale-source'
  | 'fetch-failed'
  | 'parse-failed'
  | 'rate-limited';

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

export type VixPayload = { raw: number };
export type CnnFgPayload = { raw: number };
export type S5fiPayload = { raw: number };

export interface Sp500DailyPayload {
  closes: number[];
  latestDate: string;
}
