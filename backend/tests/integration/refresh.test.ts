/**
 * Integration: POST /api/snapshots/refresh end-to-end.
 *
 * Parked behind describe.skip until the Miniflare + Workers Vitest pool is
 * wired up (see backend/tests/integration/README.md). The pure logic this
 * test is asserting is already covered by tests/unit/*.
 */

import { describe, it } from 'vitest';

describe.skip('POST /api/snapshots/refresh', () => {
  it('returns 201 and persists snapshot + readings on first call', () => {
    // With Miniflare: import worker, POST /api/snapshots/refresh,
    // assert response.status === 201, assert SELECT count FROM snapshots = 1,
    // assert SELECT count FROM source_readings = 4.
  });
});
