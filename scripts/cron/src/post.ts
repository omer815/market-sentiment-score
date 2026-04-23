import type { SourceId, FetchStatus } from './types.js';

export interface IngestReading {
  source_id: SourceId;
  raw_value: number | null;
  flag_triggered: 0 | 1 | null;
  normalised_value: 0 | 25 | null;
  fetch_status: FetchStatus;
  fetch_error: string | null;
  fetched_at: string;
}

export interface IngestBody {
  slot_ts: string;
  fetched_at: string;
  composite_score: 0 | 25 | 50 | 75 | 100 | null;
  status: 'complete' | 'partial' | 'no-data';
  failed_sources: SourceId[];
  readings: IngestReading[];
}

export async function postIngest(
  workerUrl: string,
  secret: string,
  body: IngestBody,
): Promise<void> {
  const url = `${workerUrl.replace(/\/$/, '')}/api/cron/ingest`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest POST ${url} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}
