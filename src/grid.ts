import {
  levelForValue,
  linearThresholds,
  logThresholds,
  quantileThresholds,
} from "./scale.js";
import type {
  HeatmapCell,
  HeatmapMatrix,
  HeatmapScale,
  HeatmapValues,
  ResolvedCell,
} from "./types.js";

function isMatrix(values: HeatmapValues): values is HeatmapMatrix {
  return Array.isArray(values[0]) || values.length === 0;
}

/**
 * Both input shapes collapse to one sparse map keyed by "row:column".
 *
 * A slot absent from the map has no data; a slot present with value 0 was
 * measured and found empty. Keeping those apart is the whole point — every
 * library that conflates them draws a gap in your records as a day off.
 */
export function normalizeValues(values: HeatmapValues | undefined): Map<string, HeatmapCell> {
  const cells = new Map<string, HeatmapCell>();
  if (!values || values.length === 0) return cells;

  if (isMatrix(values)) {
    values.forEach((rowValues, row) => {
      (rowValues ?? []).forEach((value, column) => {
        if (value === null || value === undefined || !Number.isFinite(value)) return;
        cells.set(row + ":" + column, { row, column, value, known: true });
      });
    });
    return cells;
  }

  (values as ReadonlyArray<HeatmapCell>).forEach((cell) => {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.column)) return;
    const value = Number.isFinite(cell.value) ? cell.value : 0;
    cells.set(cell.row + ":" + cell.column, {
      row: cell.row,
      column: cell.column,
      value,
      known: cell.known !== false,
      meta: cell.meta,
    });
  });
  return cells;
}

export function resolveThresholds(
  activeValues: readonly number[],
  scale: HeatmapScale,
  levels: number,
  explicit?: readonly number[],
): number[] {
  if (explicit && explicit.length > 0) return [...explicit];
  if (typeof scale === "function") {
    // A custom scale maps a value straight onto 0..1; turn that into a ladder.
    const maximum = activeValues.reduce((largest, v) => (v > largest ? v : largest), 0);
    if (maximum <= 0) return [];
    return Array.from({ length: levels }, (_, index) => {
      const target = (index + 1) / levels;
      // Find the smallest value whose scaled position reaches this band.
      const sorted = [...activeValues].sort((a, b) => a - b);
      const hit = sorted.find((value) => scale(value, activeValues) >= target);
      return hit ?? maximum;
    });
  }
  if (scale === "linear") return linearThresholds(activeValues, levels);
  if (scale === "log") return logThresholds(activeValues, levels);
  return quantileThresholds(activeValues, levels);
}

/** Every slot in the grid, shaded, in row-major order. */
export function buildCells({
  rows,
  columns,
  values,
  scale,
  levels,
  thresholds: explicitThresholds,
  isSlotHidden,
}: {
  rows: number;
  columns: number;
  values: HeatmapValues | undefined;
  scale: HeatmapScale;
  levels: number;
  thresholds?: readonly number[];
  isSlotHidden?: (row: number, column: number) => boolean;
}): { cells: ResolvedCell[]; thresholds: number[]; total: number; unknownCount: number } {
  const known = normalizeValues(values);
  const activeValues: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (isSlotHidden?.(row, column)) continue;
      const cell = known.get(row + ":" + column);
      if (cell && cell.known !== false && cell.value > 0) activeValues.push(cell.value);
    }
  }

  const thresholds = resolveThresholds(activeValues, scale, levels, explicitThresholds);
  const cells: ResolvedCell[] = [];
  let total = 0;
  let unknownCount = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (isSlotHidden?.(row, column)) continue;
      const cell = known.get(row + ":" + column);
      const isKnown = Boolean(cell) && cell!.known !== false;
      const value = isKnown ? cell!.value : 0;
      if (isKnown) total += value;
      else unknownCount += 1;

      cells.push({
        row,
        column,
        value,
        known: isKnown,
        level: isKnown ? levelForValue(value, thresholds, levels) : 0,
        meta: cell?.meta,
      });
    }
  }

  return { cells, thresholds, total, unknownCount };
}
