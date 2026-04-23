export type FetchStatus =
  | 'ok'
  | 'stale-source'
  | 'fetch-failed'
  | 'parse-failed'
  | 'rate-limited';

export const SUCCESS_STATUSES: ReadonlyArray<FetchStatus> = ['ok', 'stale-source'];

export function isSuccessStatus(s: FetchStatus): boolean {
  return SUCCESS_STATUSES.includes(s);
}

export class FetchFailure extends Error {
  constructor(
    public readonly status: Exclude<FetchStatus, 'ok' | 'stale-source'>,
    message: string,
  ) {
    super(message);
    this.name = 'FetchFailure';
  }
}

export function classifyHttpError(status: number, body: string): FetchFailure {
  if (status === 429) return new FetchFailure('rate-limited', `HTTP 429: ${body.slice(0, 120)}`);
  if (status >= 500) return new FetchFailure('fetch-failed', `HTTP ${status}: ${body.slice(0, 120)}`);
  if (status >= 400) return new FetchFailure('fetch-failed', `HTTP ${status}: ${body.slice(0, 120)}`);
  return new FetchFailure('fetch-failed', `HTTP ${status}: ${body.slice(0, 120)}`);
}
