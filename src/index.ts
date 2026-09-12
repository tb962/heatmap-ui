"use client";

export { Heatmap } from "./heatmap.js";
export { Heatmap3D } from "./heatmap3d.js";
export { renderHeatmap3DSvg, type Heatmap3DSvgLabel, type Heatmap3DSvgOptions } from "./static-svg.js";
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
export {
  deriveRamp,
  HEATMAP_3D_THEMES,
  luminance,
  mixHex,
  parseHex,
  resolve3DColors,
  resolve3DFaceColor,
  resolve3DTheme,
  type Heatmap3DThemePreset,
  type RampOptions,
} from "./colors.js";
export type {
  HeatmapCell,
  Heatmap3DProps,
  Heatmap3DShape,
  Heatmap3DBlockStyle,
  Heatmap3DCamera,
  Heatmap3DFace,
  Heatmap3DFaceColor,
  Heatmap3DFaceColorArgs,
  Heatmap3DThemeName,
  Heatmap3DMaterial,
  Heatmap3DPattern,
  Heatmap3DAnimation,
  HeatmapEncoding,
  HeatmapLegendLabels,
  HeatmapMatrix,
  HeatmapProps,
  HeatmapScale,
  HeatmapShape,
  HeatmapValues,
  ResolvedCell,
} from "./types.js";
