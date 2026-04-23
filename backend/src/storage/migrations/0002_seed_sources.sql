-- 0002_seed_sources.sql
-- One row per data source with its flag rule (shown in the UI breakdown).

INSERT INTO source_metadata (source_id, display_name, description, flag_rule, points_on_trigger, update_cadence) VALUES
  ('vix',    'CBOE VIX',                     'S&P 500 30-day implied volatility — higher = more fear.', 'VIX > 30',                             25, '30m'),
  ('cnn_fg', 'CNN Fear & Greed',             'CNN''s composite market sentiment index (0–100).',         'CNN F&G < 20',                         25, '30m'),
  ('s5fi',   'S&P 500 above 50-DMA (S5FI)',  'Percentage of S&P 500 constituents trading above their 50-day moving average.', 'S5FI < 20',         25, '1d'),
  ('sp500',  'S&P 500 (daily streak)',       'S&P 500 daily close vs. prior close — "red day" = close below prior close.',    '≥ 3 consecutive red daily closes', 25, '1d');
