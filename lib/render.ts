import type { CompositeScore, ScoreResult, Signal } from './types.js';

// Red -> green across the 4 discrete stops.
const STOP_COLORS: Record<number, string> = {
  0: '#c0392b',
  33: '#e67e22',
  67: '#7dcea0',
  100: '#27ae60',
};

function colorFor(score: CompositeScore | null): string {
  if (score === null) return '#7f8c8d';
  return STOP_COLORS[score] ?? '#7f8c8d';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function signalRow(s: Signal): string {
  const mark = !s.available ? '—' : s.triggered ? '✓' : '✗';
  const valueText = !s.available ? '(unavailable)' : String(s.value);
  return `
    <li class="signal ${s.triggered && s.available ? 'on' : 'off'}">
      <span class="mark" aria-hidden="true">${mark}</span>
      <span class="name">${esc(s.label)}</span>
      <span class="value">${esc(valueText)}</span>
      <span class="rule">${esc(s.rule)}</span>
    </li>`;
}

export function renderHtml(result: ScoreResult): string {
  const color = colorFor(result.score);
  const scoreText = result.score === null ? '—' : String(result.score);
  const rows = result.signals.map(signalRow).join('');
  const partialNote = result.partial
    ? `<p class="partial">Some sources were unavailable — score may be understated.</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Market Sentiment Score</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; }
    main { text-align: center; padding: 2rem; max-width: 32rem; }
    .score { font-size: 6rem; font-weight: 800; line-height: 1; color: ${color}; }
    .label { font-size: 1.5rem; margin: 0.25rem 0 1.5rem; }
    ul { list-style: none; padding: 0; text-align: left; }
    .signal { display: grid; grid-template-columns: 1.5rem 1fr auto; gap: 0.5rem 0.75rem; padding: 0.5rem 0; border-top: 1px solid #8884; align-items: baseline; }
    .signal .rule { grid-column: 2 / 4; font-size: 0.8rem; opacity: 0.6; }
    .mark { font-weight: 700; }
    .signal.on .mark { color: #27ae60; }
    .signal.off .mark { color: #c0392b; }
    .value { font-variant-numeric: tabular-nums; font-weight: 600; }
    .partial { color: #e67e22; font-size: 0.9rem; }
    .asof { font-size: 0.8rem; opacity: 0.6; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <main>
    <div class="score">${scoreText}</div>
    <p class="label">${esc(result.label)}</p>
    ${partialNote}
    <ul>${rows}</ul>
    <p class="asof">As of ${esc(result.asOf)} · reload to refresh</p>
  </main>
</body>
</html>`;
}
