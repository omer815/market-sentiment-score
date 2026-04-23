/** See backend/tests/integration/README.md for why this is skipped. */
import { describe, it } from 'vitest';

describe.skip('Read endpoints', () => {
  it('GET /api/health — degraded on empty DB, ok with a complete/partial latest', () => {
    // ...
  });

  it('GET /api/sources — returns the 4 seeded rows with human-readable flag_rule', () => {
    // ...
  });

  it('GET /api/snapshots/latest — 204 on empty DB, 200 Snapshot otherwise', () => {
    // ...
  });

  it('GET /api/snapshots?from=&to= — returns list of points in range', () => {
    // ...
  });
});
