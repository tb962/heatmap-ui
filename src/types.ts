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

  /** Shade bands. "linear" is the default and cuts at even fractions of the
   *  largest value, the behaviour readers know from GitHub. "quantile" ranks the
   *  active values instead, which suits heavy-tailed data. */
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
  /** Optional visual content centred inside a cell. Pair with `cellLabel` for accessible text. */
  cellContent?: (cell: ResolvedCell) => ReactNode;
  /** Per-cell accessible name. Cells are unlabelled, and unfocusable, without it. */
  cellLabel?: (cell: ResolvedCell) => string;
  onCellClick?: (cell: ResolvedCell) => void;

  showLegend?: boolean;
  legendLabels?: HeatmapLegendLabels;

  ariaLabel?: string;
  style?: CSSProperties;
};

export type Heatmap3DShape = "rectangle" | "circle" | "bar";
export type Heatmap3DBlockStyle = "solid" | "lego" | "building";
export type Heatmap3DCamera = { yaw: number; pitch: number; zoom: number };
/** `side` is a convenient alias for patterns; geometry reports left/right. */
export type Heatmap3DFace = "top" | "side" | "left" | "right";
export type Heatmap3DThemeName = "color" | "night" | "seasonal" | "rainbow";
export type Heatmap3DMaterial = "solid" | "pattern";
export type Heatmap3DAnimation = "none" | "grow";

/**
 * An SVG bitmap row. Numbers are read from the most-significant bit; strings
 * may be binary ("0101") or hexadecimal ("0x5"). The row count is the
 * pattern height, so a compact pattern needs no separate height prop.
 */
export type Heatmap3DPattern = {
  width: number;
  bitmap: readonly (number | string)[];
  background?: string;
  foreground?: string;
};

export type Heatmap3DFaceColorArgs = {
  cell: ResolvedCell;
  face: Heatmap3DFace;
  color: string;
  level: number;
  theme: Heatmap3DThemeName;
};

/** Override the default top/side material treatment for a cell. */
export type Heatmap3DFaceColor = (args: Heatmap3DFaceColorArgs) => string;

/** Heights encode actual values linearly, independently of the colour bands. */
export type Heatmap3DProps = Omit<HeatmapProps, "shape" | "encode" | "radius" | "minScale" | "cellContent"> & {
  shape?: Heatmap3DShape;
  blockStyle?: Heatmap3DBlockStyle;
  /** Surface treatment. `color` defers to `colors`; the rest set their own. */
  theme?: Heatmap3DThemeName;
  /** Solid fills or reusable SVG bitmap fills. */
  material?: Heatmap3DMaterial;
  /** Per-face bitmap rows, indexed by level. Missing entries use a built-in pattern. */
  patterns?: Partial<Record<Heatmap3DFace, readonly Heatmap3DPattern[]>>;
  /** Resolve a concrete fill separately for top and visible side faces. */
  faceColor?: Heatmap3DFaceColor;
  /** Opt-in entrance motion. The reduced-motion variant is supplied by the stylesheet. */
  animation?: Heatmap3DAnimation;
  /** Maximum elevation in grid units. Defaults to 100. */
  maxHeight?: number;
  /** Defaults to [0, largest positive value]. Values outside the domain clamp.
   * Negative values remain labelled but are drawn flat at the zero plane. */
  heightDomain?: readonly [number, number];
  /** Horizontal orbit in degrees. Defaults to -35. */
  yaw?: number;
  /** Elevation in degrees, clamped to 15–75. Defaults to 38. */
  pitch?: number;
  /** Magnification, clamped to 0.55–2. Defaults to 1. */
  zoom?: number;
  onCameraChange?: (camera: Heatmap3DCamera) => void;
  /** Drag to orbit; focus the chart and use arrows to rotate, +/- to zoom. */
  interactive?: boolean;
  /** Displays zoom and reset buttons. Defaults to true. */
  showControls?: boolean;
};
