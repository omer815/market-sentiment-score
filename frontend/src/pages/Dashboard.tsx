import { useQuery } from '@tanstack/react-query';
import { fetchLatestSnapshot } from '../lib/api.js';
import { CompositeHeatmap } from '../components/CompositeHeatmap.js';
import { ScoringBreakdown } from '../components/ScoringBreakdown.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { PartialBadge } from '../components/PartialBadge.js';
import { StaleBadge } from '../components/StaleBadge.js';
import { copy } from '../lib/copy.js';

const REFRESH_INTERVAL_MS = 30_000;

export function Dashboard() {
  const q = useQuery({
    queryKey: ['latest-snapshot'],
    queryFn: fetchLatestSnapshot,
    refetchInterval: REFRESH_INTERVAL_MS,
    retry: (count) => count < 3,
  });

  if (q.isLoading) {
    return (
      <div className="card state-box" role="status" aria-live="polite">
        Loading latest score…
      </div>
    );
  }

  if (q.isError) {
    // 404 (no data yet) → empty; everything else → error.
    const msg = q.error instanceof Error ? q.error.message : String(q.error);
    if (/HTTP 404/.test(msg)) return <EmptyState />;
    return <ErrorState message={msg} />;
  }

  const snap = q.data;
  if (!snap) return <EmptyState />;

  if (snap.status === 'no-data' || snap.composite_score == null) {
    return <EmptyState />;
  }

  return (
    <section aria-labelledby="dashboard-heading">
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <h2 id="dashboard-heading" style={{ margin: 0, fontSize: '1.1rem' }}>
            Current score
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <PartialBadge failed={snap.failed_sources} />
            <StaleBadge fetchedAt={snap.fetched_at} />
          </div>
        </div>

        <CompositeHeatmap score={snap.composite_score} />

        <div
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.85rem',
            marginTop: 'var(--space-3)',
          }}
        >
          Slot: <time dateTime={snap.slot_ts}>{snap.slot_ts}</time> · Status:{' '}
          {copy.snapshot.status[snap.status]}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Scoring breakdown</h3>
        <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          Each source contributes 25 points when its flag triggers.
        </p>
        <ScoringBreakdown readings={snap.readings} />
      </div>
    </section>
  );
}
