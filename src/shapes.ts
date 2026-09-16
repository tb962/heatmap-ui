import type { CSSProperties } from "react";

import type { HeatmapShape } from "./types.js";

/**
 * Shape geometry. Rounded, square and circle are corner radii; the rest are
 * clip paths, which keeps every shape a single element that can still carry a
 * background, an outline and a transition.
 */
const CLIP_PATHS: Partial<Record<HeatmapShape, string>> = {
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  hexagon: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
  plus:
    "polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, " +
    "65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)",
};

const RADII: Partial<Record<HeatmapShape, string>> = {
  rounded: "22%",
  square: "0",
  circle: "50%",
  bar: "2px",
  ring: "50%",
};

/** Hexagons tile only when alternate rows are offset by half a column. */
export function rowOffset(shape: HeatmapShape, row: number, columnWidth: number): number {
  return shape === "hexagon" && row % 2 === 1 ? columnWidth / 2 : 0;
}

/** Hexagon rows interlock, so they sit closer together than their box height. */
export function rowSpacing(shape: HeatmapShape, cellSize: number, gap: number): number {
  return shape === "hexagon" ? cellSize * 0.75 + gap : cellSize + gap;
}

/** Shapes that must keep a 1:1 box, or a circle becomes an ellipse. */
export function isRoundShape(shape: HeatmapShape): boolean {
  return shape === "circle" || shape === "ring";
}

/**
 * `minSide` is the shorter edge of a non-square cell. A percentage radius
 * resolves against each axis separately, so `rounded` would turn elliptical on
 * a tall, thin cell; it is converted to pixels off the shorter edge instead.
 */
export function shapeStyle(
  shape: HeatmapShape,
  radius: number | string | undefined,
  minSide?: number,
): CSSProperties {
  const style: CSSProperties = {};
  const clipPath = CLIP_PATHS[shape];
  if (clipPath) style.clipPath = clipPath;

  if (radius !== undefined) {
    style.borderRadius = typeof radius === "number" ? radius + "px" : radius;
  } else if (shape === "rounded" && minSide !== undefined) {
    style.borderRadius = Math.round(minSide * 0.22) + "px";
  } else if (RADII[shape]) {
    style.borderRadius = RADII[shape];
  }

  return style;
}

/**
 * `bar` grows from the bottom and `ring` thickens inward, so both express
 * intensity through geometry and need the level to draw themselves.
 * `cellSize` is the extent they grow across: the cell height for `bar`, the
 * shorter side for `ring`.
 */
export function fillStyle(
  shape: HeatmapShape,
  level: number,
  levels: number,
  color: string,
  cellSize: number,
): CSSProperties {
  const intensity = levels > 0 ? level / levels : 0;

  if (shape === "bar") {
    return {
      height: Math.max(2, Math.round(cellSize * Math.max(intensity, 0.08))) + "px",
      alignSelf: "end",
      background: color,
    };
  }

  if (shape === "ring") {
    const thickness = Math.max(1, Math.round((cellSize / 2) * Math.max(intensity, 0.18)));
    return {
      background: "transparent",
      border: thickness + "px solid " + color,
      boxSizing: "border-box",
    };
  }

  return { background: color };
}
