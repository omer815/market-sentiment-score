# Backend integration tests

**Status**: scaffold-only. The integration tests below are written to exercise
`/api/snapshots/refresh` end-to-end against a real local D1 via Miniflare +
`@cloudflare/vitest-pool-workers`, but the Miniflare+Workers Vitest pool is
not wired up yet.

When picking this up:

1. Add a `vitest.workspace.ts` at repo root (or extend `backend/vitest.config.ts`)
   that configures `@cloudflare/vitest-pool-workers` with the D1 binding
   from `wrangler.toml`.
2. Ensure `pnpm --filter @market-sentiment/backend db:migrate:local` runs
   before the integration suite (or add a Vitest global `setup` file).
3. Un-`.skip` the suites below (they're written but parked).

## Suites (authored, skipped)

- `refresh.test.ts`       — happy-path `/refresh` 201 with mocked CNN + sidecar
- `idempotent.test.ts`    — second `/refresh` in same slot returns 200 `inserted:false`
- `partial.test.ts`       — CNN down → 201 partial, composite bounded above by 75
- `sidecar-down.test.ts`  — sidecar HTTP 502 → 201 partial (three sources failed)
- `read.test.ts`          — GET /api/health + /api/sources + /api/snapshots/latest
                            conform to contracts/openapi.yaml

The pure-function behaviour these suites depend on (scoring, parsing, slot
rounding) is already covered by the unit tests under `backend/tests/unit/`.
