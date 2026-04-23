import type { Health, RefreshResponse, Snapshot, SourceMetadata } from './api-types.js';

const BASE = (import.meta.env['VITE_API_BASE_URL'] ?? '').replace(/\/$/, '');

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (res.status === 204) {
    throw new NoContentError(path);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Signals HTTP 204 (empty DB) from /api/snapshots/latest. Callers catch this
 * to render the empty-state and optionally trigger a first-visit /refresh.
 */
export class NoContentError extends Error {
  constructor(path: string) {
    super(`No content for ${path}`);
    this.name = 'NoContentError';
  }
}

export function fetchLatestSnapshot(): Promise<Snapshot> {
  return getJson<Snapshot>('/api/snapshots/latest');
}

export function fetchSources(): Promise<SourceMetadata[]> {
  return getJson<SourceMetadata[]>('/api/sources');
}

export function fetchHealth(): Promise<Health> {
  return getJson<Health>('/api/health');
}

/**
 * Trigger a new snapshot. Returns the fresh Snapshot on 201, or the
 * existing Snapshot wrapped in `{inserted:false, snapshot}` on 200.
 */
export function refreshSnapshot(): Promise<RefreshResponse> {
  return postJson<RefreshResponse>('/api/snapshots/refresh');
}

/** Normalise either RefreshResponse shape to the underlying Snapshot. */
export function snapshotFromRefresh(r: RefreshResponse): Snapshot {
  if (r.inserted === false) return r.snapshot;
  const { inserted: _inserted, ...snap } = r;
  return snap as Snapshot;
}
