/**
 * Sidecar internal types. The HTTP contract between sidecar and Worker lives
 * in `api/fetch.ts` and `backend/src/fetchers/sidecar.ts`; those are the
 * canonical shape definitions. Keep this file small and local.
 */

export interface VixQuote {
  raw: number;
  fetched_at: string;
}

export interface S5fiQuote {
  raw: number;
  fetched_at: string;
}

export interface Sp500DailyPayload {
  /** Most recent completed daily closes, oldest-first. */
  closes: number[];
  /** Date (YYYY-MM-DD UTC) of the most recent completed close. */
  latest_date: string;
  fetched_at: string;
}
