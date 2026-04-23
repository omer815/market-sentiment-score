/** See backend/tests/integration/README.md for why this is skipped. */
import { describe, it } from 'vitest';

describe.skip('POST /api/snapshots/refresh idempotency', () => {
  it('second call within same slot returns 200 inserted:false with same snapshot', () => {
    // Call /refresh twice; assert 201 then 200 { inserted: false }; assert
    // SELECT count FROM snapshots WHERE slot_ts = ? === 1.
  });
});
