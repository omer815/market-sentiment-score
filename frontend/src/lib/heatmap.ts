export type CompositeStop = 0 | 25 | 50 | 75 | 100;

export const HEATMAP_STOPS: ReadonlyArray<CompositeStop> = [0, 25, 50, 75, 100];

/**
 * Map a composite score to the CSS variable that owns its heat stop colour.
 * Returns the variable *name* (e.g., `--composite-50`), not the value — consumers
 * build the CSS token themselves via `var(${name})` so tests can assert on names.
 */
export function heatmapVarName(score: CompositeStop): string {
  return `--composite-${score}`;
}

export function heatmapColor(score: CompositeStop): string {
  return `var(${heatmapVarName(score)})`;
}
