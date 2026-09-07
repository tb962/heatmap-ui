/**
 * Shading strategies.
 *
 * The default is quantile, which is deliberately unlike most heatmap
 * libraries. Activity data is heavy-tailed — a single long day can be twenty
 * times the median — so cutting bands at fractions of the maximum drops the
 * bulk of the data into the palest shade and throws away the detail the chart
 * exists to show. Ranking the active values keeps every band populated
 * whatever the unit.
 */

/** Band ceilings from the quantiles of the active values, ascending. */
export function quantileThresholds(values: readonly number[], bands = 4): number[] {
  const active = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (active.length === 0) return [];

  const thresholds: number[] = [];
  for (let band = 1; band < bands; band += 1) {
    const rank = Math.ceil((active.length * band) / bands) - 1;
    const candidate = active[Math.max(0, Math.min(active.length - 1, rank))];
    // Keep the ladder strictly increasing: a repeated value would create a
    // band nothing can land in and skew every lookup above it.
    if (thresholds.length === 0 || candidate > thresholds[thresholds.length - 1]) {
      thresholds.push(candidate);
    }
  }

  const maximum = active[active.length - 1];
  if (thresholds.length === 0 || maximum > thresholds[thresholds.length - 1]) {
    thresholds.push(maximum);
  }
  return thresholds;
}

/** Band ceilings at even fractions of the maximum. */
export function linearThresholds(values: readonly number[], bands = 4): number[] {
  const maximum = values.reduce((largest, value) => (value > largest ? value : largest), 0);
  if (maximum <= 0) return [];
  return Array.from({ length: bands }, (_, index) => (maximum * (index + 1)) / bands);
}

/** Band ceilings spaced logarithmically, for values spanning orders of magnitude. */
export function logThresholds(values: readonly number[], bands = 4): number[] {
  const active = values.filter((value) => value > 0);
  if (active.length === 0) return [];
  const maximum = Math.max(...active);
  const span = Math.log10(maximum + 1);
  if (span <= 0) return [maximum];
  return Array.from(
    { length: bands },
    (_, index) => Math.pow(10, (span * (index + 1)) / bands) - 1,
  );
}

/** Places a value on a ladder of band ceilings. Returns 0 for empty. */
export function levelForValue(
  value: number,
  thresholds: readonly number[],
  levels: number,
): number {
  if (value <= 0 || thresholds.length === 0) return 0;
  const index = thresholds.findIndex((threshold) => value <= threshold);
  const band = index === -1 ? thresholds.length : index + 1;
  // A short ladder (few distinct values) still spans the full palette.
  return Math.max(1, Math.min(levels, Math.round((band / thresholds.length) * levels)));
}
