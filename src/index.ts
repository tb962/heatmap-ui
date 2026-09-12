"use client";

export { Heatmap } from "./heatmap.js";
export { Heatmap3D } from "./heatmap3d.js";
export { CalendarHeatmap, CalendarHeatmap3D, type CalendarCell, type CalendarDay, type CalendarHeatmapProps, type CalendarHeatmap3DProps } from "./calendar.js";
export { normalizeCamera, resolveHeightDomain, valueToHeight, projectPoint, projectionBounds, type Point3D, type ProjectedPoint } from "./projection3d.js";
export { buildCells, normalizeValues, resolveThresholds } from "./grid.js";
export {
  levelForValue,
  linearThresholds,
  logThresholds,
  quantileThresholds,
} from "./scale.js";
export { fillStyle, rowOffset, rowSpacing, shapeStyle } from "./shapes.js";
export { deriveRamp, luminance, parseHex, type RampOptions } from "./colors.js";
export type {
  HeatmapCell,
  Heatmap3DProps,
  Heatmap3DShape,
  Heatmap3DBlockStyle,
  Heatmap3DCamera,
  HeatmapEncoding,
  HeatmapLegendLabels,
  HeatmapMatrix,
  HeatmapProps,
  HeatmapScale,
  HeatmapShape,
  HeatmapValues,
  ResolvedCell,
} from "./types.js";
