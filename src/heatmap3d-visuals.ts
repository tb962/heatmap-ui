import { resolve3DColors, resolve3DFaceColor, resolve3DTheme } from "./colors.js";
import { patternFor, patternId, type NormalizedHeatmap3DPattern } from "./heatmap3d-patterns.js";
import type {
  Heatmap3DFace,
  Heatmap3DFaceColor,
  Heatmap3DMaterial,
  Heatmap3DPattern,
  Heatmap3DThemeName,
  ResolvedCell,
} from "./types.js";

export const DEFAULT_HEATMAP_3D_COLORS = ["#9be9a8", "#40c463", "#30a14e", "#216e39"] as const;

export type Heatmap3DVisualOptions = {
  theme: Heatmap3DThemeName;
  material: Heatmap3DMaterial;
  colors?: readonly string[];
  emptyColor?: string;
  patterns?: Partial<Record<Heatmap3DFace, readonly Heatmap3DPattern[]>>;
  faceColor?: Heatmap3DFaceColor;
  levels: number;
  columns: number;
  patternPrefix: string;
};

export type Heatmap3DCellVisual = {
  baseColor: string;
  faceColor: (face: Heatmap3DFace) => string;
  patternId: (face: Heatmap3DFace) => string | undefined;
};

export function resolveHeatmap3DVisual({
  cell,
  options,
}: {
  cell: ResolvedCell;
  options: Heatmap3DVisualOptions;
}): Heatmap3DCellVisual {
  const palette = resolve3DColors({
    theme: options.theme,
    colors: options.colors,
    column: cell.column,
    columns: options.columns,
    levels: options.levels,
  });
  const baseColor = cell.level > 0
    ? palette[Math.min(palette.length - 1, cell.level - 1)]
    : options.emptyColor ?? resolve3DTheme(options.theme).emptyColor;
  return {
    baseColor,
    faceColor: (face) => resolve3DFaceColor({
      cell,
      face,
      color: baseColor,
      level: cell.level,
      theme: options.theme,
      faceColor: options.faceColor,
    }),
    patternId: (face) => {
      if (options.material !== "pattern" || !cell.known || cell.level <= 0) return undefined;
      return patternId(options.patternPrefix, face, cell.level);
    },
  };
}

export function resolveHeatmap3DPattern({
  face,
  level,
  options,
}: {
  face: Heatmap3DFace;
  level: number;
  options: Heatmap3DVisualOptions;
}): NormalizedHeatmap3DPattern {
  return patternFor({
    patterns: options.patterns,
    face,
    level,
    levels: options.levels,
    theme: options.theme,
  });
}

export function heatmap3DLegendColors(options: Heatmap3DVisualOptions): string[] {
  return resolve3DColors({
    theme: options.theme,
    colors: options.colors,
    column: Math.max(0, Math.floor(options.columns / 2)),
    columns: options.columns,
    levels: options.levels,
  });
}
