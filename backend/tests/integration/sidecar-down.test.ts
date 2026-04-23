/** See backend/tests/integration/README.md for why this is skipped. */
import { describe, it } from 'vitest';

describe.skip('POST /api/snapshots/refresh with sidecar unreachable', () => {
  it('returns 201 with three failed_sources when sidecar is down but CNN works', () => {
    // Mock fetch(SIDECAR_URL) → 502. Expect status 201, failed_sources
    // includes vix, sp500, s5fi; composite_score <= 25 (CNN's points only).
  });

  it('returns 502 no-data row when both CNN and sidecar are down', () => {
    // Mock both to fail. Expect HTTP 502, SELECT row WHERE slot_ts = ?
    // has status='no-data' and composite_score IS NULL.
  });
});
