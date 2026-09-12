import { resolve3DTheme } from "./colors.js";
import type { Heatmap3DFace, Heatmap3DPattern, Heatmap3DThemeName } from "./types.js";

export type NormalizedHeatmap3DPattern = {
  width: number;
  bitmap: number[];
  background: string;
  foreground: string;
};

const MAX_PATTERN_WIDTH = 32;

function rowValue(value: number | string): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(Math.max(0, value)) : 0;
  const trimmed = value.trim();
  if (/^[01]+$/.test(trimmed)) return Number.parseInt(trimmed, 2);
  const parsed = Number.parseInt(trimmed.replace(/^#/, "").replace(/^0x/i, ""), 16);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizePattern(pattern: Heatmap3DPattern | undefined): NormalizedHeatmap3DPattern | null {
  if (!pattern || !Number.isInteger(pattern.width) || pattern.width < 1 || pattern.width > MAX_PATTERN_WIDTH || !Array.isArray(pattern.bitmap) || pattern.bitmap.length === 0) {
    return null;
  }
  return {
    width: pattern.width,
    bitmap: pattern.bitmap.map((row) => rowValue(row)),
    background: pattern.background ?? "transparent",
    foreground: pattern.foreground ?? "currentColor",
  };
}

export function patternPath(pattern: NormalizedHeatmap3DPattern): string {
  const cells: string[] = [];
  pattern.bitmap.forEach((row, y) => {
    for (let x = 0; x < pattern.width; x += 1) {
      const bit = 2 ** (pattern.width - x - 1);
      if (row >= bit && Math.floor(row / bit) % 2 === 1) cells.push(`M${x} ${y}h1v1H${x}z`);
    }
  });
  return cells.join("");
}

export function builtInPattern(
  face: Heatmap3DFace,
  level: number,
  levels: number,
  theme: Heatmap3DThemeName,
): NormalizedHeatmap3DPattern {
  const density = Math.max(1, Math.min(4, Math.ceil((Math.max(1, level) / Math.max(1, levels)) * 4)));
  const bitmap = [
    density >= 1 ? 0b1000 : 0,
    density >= 3 ? 0b0010 : 0,
    density >= 2 ? 0b0100 : 0,
    density >= 4 ? 0b0001 : 0,
  ];
  return {
    width: 4,
    bitmap,
    background: "transparent",
    foreground: face === "top" ? "#ffffffb8" : resolve3DTheme(theme).floor,
  };
}

export function patternFor({
  patterns,
  face,
  level,
  levels,
  theme,
}: {
  patterns?: Partial<Record<Heatmap3DFace, readonly Heatmap3DPattern[]>>;
  face: Heatmap3DFace;
  level: number;
  levels: number;
  theme: Heatmap3DThemeName;
}): NormalizedHeatmap3DPattern {
  const facePatterns = patterns?.[face] ?? (face === "left" || face === "right" ? patterns?.side : undefined);
  const configured = facePatterns?.[Math.min(Math.max(0, level - 1), (facePatterns.length ?? 1) - 1)];
  return normalizePattern(configured) ?? builtInPattern(face, level, levels, theme);
}

export function patternId(prefix: string, face: Heatmap3DFace, level: number): string {
  return `${prefix}-${face}-${level}`;
}
