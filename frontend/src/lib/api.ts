import type { Snapshot, SourceMetadata } from './api-types.js';

const BASE = import.meta.env['VITE_API_BASE'] ?? '';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function fetchLatestSnapshot(): Promise<Snapshot> {
  return getJson<Snapshot>('/api/snapshots/latest');
}

export function fetchSources(): Promise<SourceMetadata[]> {
  return getJson<SourceMetadata[]>('/api/sources');
}
