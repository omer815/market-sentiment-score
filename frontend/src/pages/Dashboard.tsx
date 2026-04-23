import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NoContentError, fetchLatestSnapshot, refreshSnapshot } from '../lib/api.js';
import { CompositeHeatmap } from '../components/CompositeHeatmap.js';
import { ScoringBreakdown } from '../components/ScoringBreakdown.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { PartialBadge } from '../components/PartialBadge.js';
import { RefreshButton } from '../components/RefreshButton.js';
import { LastRefreshed } from '../components/LastRefreshed.js';
import { copy } from '../lib/copy.js';

const REFRESH_INTERVAL_MS = 30_000;

export function Dashboard() {
  const client = useQueryClient();
  const autoTriggered = useRef(false);

  const q = useQuery({
    queryKey: ['latest-snapshot'],
    queryFn: fetchLatestSnapshot,
    refetchInterval: REFRESH_INTERVAL_MS,
    retry: (count, err) => {
      // Don't retry on 204 — the empty-DB case is handled by the auto-trigger effect below.
      if (err instanceof NoContentError) return false;
      return count < 3;
    },
  });

  const isEmpty = q.isError && q.error instanceof NoContentError;

  // FR-018 / AS1.5: if the very first query resolves to 204 (empty DB), auto-
  // trigger exactly one /refresh. Guarded with a ref so StrictMode double-mount
  // doesn't fire two refreshes.
  useEffect(() => {
    if (!isEmpty || autoTriggered.current) return;
    autoTriggered.current = true;
    void refreshSnapshot()
      .then(() => client.invalidateQueries({ queryKey: ['latest-snapshot'] }))
      .catch(() => {
        // Keep the failed empty state visible; the user can click Refresh manually.
      });
  }, [isEmpty, client]);

  if (q.isLoading) {
    return (
      <div className="card state-box" role="status" aria-live="polite">
        {copy.empty.firstLoad}
      </div>
    );
  }

  if (isEmpty) {
    return <EmptyState variant="firstLoad" />;
  }

  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : String(q.error);
    return <ErrorState message={msg} />;
  }

  const snap = q.data;
  if (!snap) return <EmptyState />;

  if (snap.status === 'no-data' || snap.composite_score == null) {
    return (
      <section aria-labelledby="dashboard-heading">
        <div className="card">
          <div className="card__header">
            <h2 id="dashboard-heading">Current score</h2>
            <RefreshButton />
          </div>
          <EmptyState variant="failed" />
          <div className="card__footnote">
            Slot: <time dateTime={snap.slot_ts}>{snap.slot_ts}</time> ·{' '}
            {copy.snapshot.status[snap.status]}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="dashboard-heading">
      <div className="card">
        <div className="card__header">
          <h2 id="dashboard-heading">Current score</h2>
          <div className="card__actions">
            <PartialBadge failed={snap.failed_sources} />
            <LastRefreshed fetchedAt={snap.fetched_at} />
            <RefreshButton />
          </div>
        </div>

        <CompositeHeatmap score={snap.composite_score} />

        <div className="card__footnote">
          Slot: <time dateTime={snap.slot_ts}>{snap.slot_ts}</time> ·{' '}
          {copy.snapshot.status[snap.status]}
        </div>
      </div>

      <div className="card">
        <h3>Scoring breakdown</h3>
        <p className="card__subtitle">
          Each source contributes 25 points when its flag triggers.
        </p>
        <ScoringBreakdown readings={snap.readings} />
      </div>
    </section>
  );
}
