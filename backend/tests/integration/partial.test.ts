/** See backend/tests/integration/README.md for why this is skipped. */
import { describe, it } from 'vitest';

describe.skip('POST /api/snapshots/refresh with CNN down', () => {
  it('returns 201 with status=partial and failed_sources=[cnn_fg]', () => {
    // Mock fetch(CNN_URL) → 500. Assert response.status === 201,
    // body.status === 'partial', body.failed_sources === ['cnn_fg'],
    // body.composite_score <= 75.
  });
});
