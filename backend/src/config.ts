import { z } from 'zod';

const numFromString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : Number(v)))
  .refine((n) => Number.isFinite(n), { message: 'must be a finite number' });

const ConfigSchema = z.object({
  VIX_THRESHOLD: numFromString.default(30),
  FG_THRESHOLD: numFromString.default(20),
  S5FI_THRESHOLD: numFromString.default(20),
  SP500_RED_DAYS_MIN: numFromString
    .default(3)
    .refine((n) => Number.isInteger(n) && n >= 1, { message: 'must be a positive integer' }),
});

export type ScoringConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, unknown>): ScoringConfig {
  return ConfigSchema.parse({
    VIX_THRESHOLD: env['VIX_THRESHOLD'],
    FG_THRESHOLD: env['FG_THRESHOLD'],
    S5FI_THRESHOLD: env['S5FI_THRESHOLD'],
    SP500_RED_DAYS_MIN: env['SP500_RED_DAYS_MIN'],
  });
}
