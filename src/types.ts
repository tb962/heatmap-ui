import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * A dense grid. `null` marks a slot with no data, which is not the same as a
 * slot whose value is zero.
 */
export type HeatmapMatrix = ReadonlyArray<ReadonlyArray<number | null>>;

/** A sparse cell. Anything not listed is treated as having no data. */
export type HeatmapCell = {
  row: number;
  column: number;
  value: number;
  /** false when the slot is covered by no data at all. Defaults to true. */
  known?: boolean;
  /** Passed back untouched to `tooltip` and `cellLabel`. */
  meta?: unknown;
};

export type HeatmapValues = HeatmapMatrix | ReadonlyArray<HeatmapCell>;

/** A cell after normalisation, shading and layout. */
export type ResolvedCell = {
  row: number;
  column: number;
  value: number;
  known: boolean;
  /** 0 for empty, then 1..levels. */
  level: number;
  meta: unknown;
};

export type HeatmapShape =
  | "rounded"
  | "square"
  | "circle"
  | "diamond"
  | "hexagon"
  | "plus"
  | "bar"
  | "ring";

/**
 * How intensity is conveyed. Colour alone is invisible to roughly one reader
 * in twelve, so "size" and "both" exist to encode it redundantly.
 */
export type HeatmapEncoding = "color" | "size" | "both";

export type HeatmapScale =
  | "quantile"
  | "linear"
  | "log"
  | ((value: number, values: readonly number[]) => number);

export type HeatmapLegendLabels = {
  less?: ReactNode;
  more?: ReactNode;
  unknown?: ReactNode;
};

export type HeatmapProps = Omit<HTMLAttributes<HTMLDivElement>, "values"> & {
  rows: number;
  columns: number;
  values?: HeatmapValues;

  /** Shade bands. "quantile" ranks the active values; it is the default because
   *  activity data is heavy-tailed and scaling against the maximum flattens it. */
  scale?: HeatmapScale;
  /** Number of shade bands. Defaults to the length of `colors`, else 4. */
  levels?: number;
  /** Explicit band ceilings, ascending. Skips `scale` entirely. */
  thresholds?: readonly number[];

  shape?: HeatmapShape;
  encode?: HeatmapEncoding;
  cellSize?: number;
  gap?: number;
  /** Overrides the shape's own corner rounding. */
  radius?: number | string;
  /** The ramp, palest first. */
  colors?: readonly string[];
  /** A slot with a known value of zero. */
  emptyColor?: string;
  /** Opacity applied to slots with no data. */
  unknownOpacity?: number;
  /** Smallest fraction of the slot a "size"-encoded cell may shrink to. */
  minScale?: number;

  /**
   * Hides slots that do not exist, as opposed to slots with no data. A
   * calendar's final column is partial, and a month view is ragged at both
   * ends; those slots should not be drawn at all.
   */
  isSlotHidden?: (row: number, column: number) => boolean;

  rowLabels?: ReadonlyArray<ReactNode>;
  columnLabels?: ReadonlyArray<{ column: number; text: ReactNode }>;

  tooltip?: (cell: ResolvedCell) => ReactNode;
  /** Per-cell accessible name. Cells are unlabelled, and unfocusable, without it. */
  cellLabel?: (cell: ResolvedCell) => string;
  onCellClick?: (cell: ResolvedCell) => void;

  showLegend?: boolean;
  legendLabels?: HeatmapLegendLabels;

  ariaLabel?: string;
  style?: CSSProperties;
};
