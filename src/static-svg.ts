import { resolve3DTheme } from "./colors.js";
import { buildCells } from "./grid.js";
import { buildHeatmap3DScene, cameraDirection, point, rectangle, type Heatmap3DCellGeometry, type Heatmap3DFaceGeometry } from "./heatmap3d-scene.js";
import { patternPath } from "./heatmap3d-patterns.js";
import { normalizeCamera, polygonPath, projectPoint, resolveHeightDomain } from "./projection3d.js";
import { heatmap3DLegendColors, resolveHeatmap3DPattern, resolveHeatmap3DVisual, type Heatmap3DVisualOptions } from "./heatmap3d-visuals.js";
import type {
  Heatmap3DAnimation,
  Heatmap3DBlockStyle,
  Heatmap3DCamera,
  Heatmap3DFace,
  Heatmap3DFaceColor,
  Heatmap3DMaterial,
  Heatmap3DPattern,
  Heatmap3DShape,
  Heatmap3DThemeName,
  HeatmapScale,
  HeatmapValues,
  ResolvedCell,
} from "./types.js";

export type Heatmap3DSvgLabel = string | number;

/** Options for an accessible, non-interactive SVG snapshot of a 3D heatmap. */
export type Heatmap3DSvgOptions = {
  rows: number;
  columns: number;
  values?: HeatmapValues;
  scale?: HeatmapScale;
  levels?: number;
  thresholds?: readonly number[];
  shape?: Heatmap3DShape;
  blockStyle?: Heatmap3DBlockStyle;
  cellSize?: number;
  gap?: number;
  maxHeight?: number;
  heightDomain?: readonly [number, number];
  yaw?: number;
  pitch?: number;
  zoom?: number;
  colors?: readonly string[];
  emptyColor?: string;
  unknownOpacity?: number;
  theme?: Heatmap3DThemeName;
  material?: Heatmap3DMaterial;
  patterns?: Partial<Record<Heatmap3DFace, readonly Heatmap3DPattern[]>>;
  faceColor?: Heatmap3DFaceColor;
  animation?: Heatmap3DAnimation;
  isSlotHidden?: (row: number, column: number) => boolean;
  rowLabels?: readonly Heatmap3DSvgLabel[];
  columnLabels?: readonly { column: number; text: Heatmap3DSvgLabel }[];
  cellLabel?: (cell: ResolvedCell) => string;
  showLegend?: boolean;
  ariaLabel?: string;
  className?: string;
};

type Bounds = { x: number; y: number; width: number; height: number };
const finitePositive = (value: number | undefined, fallback: number) => Number.isFinite(value) ? Math.max(0, value!) : fallback;

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Placeholder for the per-render scope; swapped for a content hash once the
// markup is complete, so the same chart always gets the same class.
const SCOPE = "heatmap3d-static-scope";

/** FNV-1a, enough to give each distinct chart its own selector and pattern ids. */
function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

/** Prefix every selector in a flat rule list so the styles only reach this SVG. */
function scopeRules(rules: string, scope: string): string {
  return rules.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors: string, body: string) =>
    `${selectors.split(",").map((selector) => `${scope} ${selector.trim()}`).join(",")}{${body}}`);
}

function number(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") : "0";
}

function labelWidth(value: Heatmap3DSvgLabel, minimum: number, factor: number): number {
  return typeof value === "string" ? Math.max(minimum, value.length * factor) : minimum;
}

function formatValue(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function surfaceMarkup(face: Heatmap3DFaceGeometry, camera: Heatmap3DCamera, visual: ReturnType<typeof resolveHeatmap3DVisual>): string {
  const path = polygonPath(face.points, camera);
  const pattern = visual.patternId(face.face);
  const fill = visual.faceColor(face.face);
  const base = pattern
    ? `<path d="${path}" fill="${escapeXml(fill)}" class="heatmap3d__surface heatmap3d__surface-base" data-face="${face.face}" pointer-events="none"/>`
    : "";
  const surface = `<path d="${path}" fill="${pattern ? `url(#${escapeXml(pattern)})` : escapeXml(fill)}" class="heatmap3d__surface" data-face="${face.face}" data-material="${pattern ? "pattern" : "solid"}"/>`;
  const shade = `<path d="${path}" fill="${face.shade >= 0 ? "#fff" : "#071b19"}" opacity="${number(Math.abs(face.shade))}" pointer-events="none"/>`;
  const windows = (face.windows ?? []).map((window, index) => `<path d="${polygonPath(window, camera)}" class="heatmap3d__window" opacity="${index % 5 === 0 ? 0.2 : index % 3 === 0 ? 0.65 : 0.42}" pointer-events="none"/>`).join("");
  return `<g>${base}${surface}${shade}${windows}</g>`;
}

function cellMarkup(entry: Heatmap3DCellGeometry, motionIndex: number, camera: Heatmap3DCamera, options: Heatmap3DVisualOptions, cellLabel?: (cell: ResolvedCell) => string, unknownOpacity = 0.5): string {
  const { cell, geometry, height } = entry;
  const visual = resolveHeatmap3DVisual({ cell, options });
  const label = cellLabel?.(cell) ?? `Row ${cell.row + 1}, column ${cell.column + 1}: ${cell.known ? cell.value : "no data"}`;
  const body = !cell.known
    ? `<path d="${polygonPath(geometry.footprint, camera)}" fill="transparent" class="heatmap3d__unknown" opacity="${number(unknownOpacity)}"/>`
    : [
        ...geometry.faces.map((face) => surfaceMarkup(face, camera, visual)),
        geometry.roof ? `<path d="${polygonPath(geometry.roof, camera)}" class="heatmap3d__roof"/>` : "",
        ...geometry.studs.flatMap((faces) => faces.map((face) => surfaceMarkup(face, camera, visual))),
      ].join("");
  return `<g class="heatmap3d__cell" data-row="${cell.row}" data-column="${cell.column}" data-known="${cell.known ? "true" : "false"}" data-value="${number(cell.value)}" data-height="${number(height)}" data-level="${cell.level}" data-material="${options.material}" style="--heatmap3d-index:${motionIndex}" role="img" aria-label="${escapeXml(label)}"><title>${escapeXml(label)}</title>${body}</g>`;
}

function sceneBounds({
  geometry,
  width,
  depth,
  size,
  maxHeight,
  camera,
  rows,
  columns,
  step,
  rowLabels,
  columnLabels,
}: {
  geometry: readonly Heatmap3DCellGeometry[];
  width: number;
  depth: number;
  size: number;
  maxHeight: number;
  camera: Heatmap3DCamera;
  rows: number;
  columns: number;
  step: number;
  rowLabels?: readonly Heatmap3DSvgLabel[];
  columnLabels?: readonly { column: number; text: Heatmap3DSvgLabel }[];
}): Bounds {
  const facing = cameraDirection(camera);
  const rowEdge = facing.x > 0.001 ? 1 : -1;
  const columnEdge = facing.y >= 0 ? 1 : -1;
  const rowOutward = rowEdge * Math.cos(camera.yaw * Math.PI / 180);
  const rowAnchor = Math.abs(rowOutward) < 0.3 ? "middle" : rowOutward > 0 ? "start" : "end";
  const rowLabelPosition = (index: number) => projectPoint(point(rowEdge * (width / 2 + size), index * step + size / 2 - depth / 2, 0), camera);
  const columnLabelPosition = (column: number) => projectPoint(point(column * step + size / 2 - width / 2, columnEdge * (depth / 2 + size), 0), camera);
  const axisCorner = point(
    (Math.cos(camera.yaw * Math.PI / 180) >= 0 ? -1 : 1) * (width / 2 + size),
    (facing.x >= 0 ? 1 : -1) * (depth / 2 + size),
    0,
  );
  const points = rectangle(0, 0, width + size, depth + size, -5);
  for (const entry of geometry) for (const footprintPoint of entry.geometry.footprint) points.push({ ...footprintPoint, z: entry.height });
  points.push(axisCorner, { ...axisCorner, z: maxHeight });
  const projected = points.map((value) => projectPoint(value, camera));
  rowLabels?.slice(0, rows).forEach((text, index) => {
    const position = rowLabelPosition(index);
    const widthOfLabel = labelWidth(text, 24, 4.5);
    projected.push({ ...position, x: position.x + (rowAnchor === "end" ? -widthOfLabel : widthOfLabel), y: position.y + 10 });
  });
  columnLabels?.forEach((entry) => {
    if (entry.column < 0 || entry.column >= columns) return;
    const position = columnLabelPosition(entry.column);
    const halfWidth = labelWidth(entry.text, 15, 2.25);
    projected.push({ ...position, x: position.x - halfWidth, y: position.y + 16 }, { ...position, x: position.x + halfWidth, y: position.y + 16 });
  });
  const extents = projected.reduce((range, value) => ({
    minX: Math.min(range.minX, value.x), maxX: Math.max(range.maxX, value.x),
    minY: Math.min(range.minY, value.y), maxY: Math.max(range.maxY, value.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const minX = extents.minX - 20;
  const maxX = extents.maxX + 12;
  const minY = extents.minY - 15;
  const maxY = extents.maxY + 15;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function gridPath(a: ReturnType<typeof point>, b: ReturnType<typeof point>, camera: Heatmap3DCamera): string {
  const start = projectPoint(a, camera);
  const end = projectPoint(b, camera);
  return `M${number(start.x)},${number(start.y)} L${number(end.x)},${number(end.y)}`;
}

/**
 * Render the same scene model as `Heatmap3D` without React or a DOM. The
 * result is suitable for a README, email, GitHub image, SSR response, or a
 * cached asset generated by a scheduled job.
 */
export function renderHeatmap3DSvg({
  rows,
  columns,
  values,
  scale = "linear",
  levels: levelsProp,
  thresholds,
  shape = "rectangle",
  blockStyle = "solid",
  cellSize = 13,
  gap = 3,
  maxHeight: maxHeightProp = 100,
  heightDomain,
  yaw,
  pitch,
  zoom,
  colors,
  emptyColor,
  unknownOpacity = 0.5,
  theme: themeProp,
  material = "solid",
  patterns,
  faceColor,
  animation = "none",
  isSlotHidden,
  rowLabels,
  columnLabels,
  cellLabel,
  showLegend = false,
  ariaLabel,
  className,
}: Heatmap3DSvgOptions): string {
  const size = Math.max(1, finitePositive(cellSize, 13));
  const gutter = finitePositive(gap, 3);
  const maxHeight = finitePositive(maxHeightProp, 100);
  const theme = themeProp ?? "color";
  const levels = Math.max(1, levelsProp ?? colors?.length ?? 4);
  const themeEmptyColor = emptyColor ?? resolve3DTheme(theme).emptyColor;
  const camera = normalizeCamera({ yaw, pitch, zoom });
  const { cells, total, unknownCount } = buildCells({ rows, columns, values, scale, levels, thresholds, isSlotHidden });
  const domain = resolveHeightDomain(cells, heightDomain);
  const step = size + gutter;
  const width = Math.max(size, columns * step - gutter);
  const depth = Math.max(size, rows * step - gutter);
  const geometry = buildHeatmap3DScene({ cells, cellSize: size, gap: gutter, width, depth, domain, maxHeight, shape, blockStyle, camera });
  const bounds = sceneBounds({ geometry, width, depth, size, maxHeight, camera, rows, columns, step, rowLabels, columnLabels });
  const sceneCenterX = bounds.x + bounds.width / 2;
  const sceneCenterY = bounds.y + bounds.height / 2;
  const visualOptions: Heatmap3DVisualOptions = {
    theme,
    material,
    colors,
    emptyColor: themeEmptyColor,
    patterns,
    faceColor,
    levels,
    columns,
    patternPrefix: `${SCOPE}-pattern`,
  };
  const patternDefinitions = material === "pattern"
    ? (["top", "left", "right"] as const).flatMap((face) => Array.from({ length: levels }, (_, index) => {
        const pattern = resolveHeatmap3DPattern({ face, level: index + 1, options: visualOptions });
        return { face, level: index + 1, pattern };
      }))
    : [];
  const facing = cameraDirection(camera);
  const rowEdge = facing.x > 0.001 ? 1 : -1;
  const columnEdge = facing.y >= 0 ? 1 : -1;
  const rowOutward = rowEdge * Math.cos(camera.yaw * Math.PI / 180);
  const rowAnchor = Math.abs(rowOutward) < 0.3 ? "middle" : rowOutward > 0 ? "start" : "end";
  const rowLabelPosition = (index: number) => projectPoint(point(rowEdge * (width / 2 + size), index * step + size / 2 - depth / 2, 0), camera);
  const columnLabelPosition = (column: number) => projectPoint(point(column * step + size / 2 - width / 2, columnEdge * (depth / 2 + size), 0), camera);
  const axisCorner = point(
    (Math.cos(camera.yaw * Math.PI / 180) >= 0 ? -1 : 1) * (width / 2 + size),
    (facing.x >= 0 ? 1 : -1) * (depth / 2 + size),
    0,
  );
  const axisBottom = projectPoint(axisCorner, camera);
  const axisTop = projectPoint({ ...axisCorner, z: maxHeight }, camera);
  const floor = rectangle(0, 0, width + size, depth + size, -1);
  const label = ariaLabel ?? `3D heatmap, ${rows} by ${columns}, height represents value${unknownCount > 0 ? `, ${unknownCount} slots with no data` : ""}`;
  const preset = resolve3DTheme(theme);
  const baseRules = `.heatmap3d__floor-edge{fill:${preset.floorEdge}}.heatmap3d__floor-surface{fill:${preset.floor};stroke:${preset.floorEdge};stroke-width:.7}.heatmap3d__grid-line{fill:none;stroke:${preset.grid};stroke-width:.45;opacity:.7}.heatmap3d__contact-shadow{fill:#111b2b;opacity:.13}.heatmap3d__surface{stroke:#ffffff30;stroke-width:.3;stroke-linejoin:round}.heatmap3d__surface-base{stroke:none}.heatmap3d__window{fill:${preset.window}}.heatmap3d__roof{fill:#07101b;fill-opacity:.11;stroke:#ffffff70;stroke-width:.45;stroke-linejoin:round}.heatmap3d__unknown{stroke:${preset.ink};stroke-width:.7;stroke-dasharray:2 1.8}.heatmap3d__axis line{stroke:${preset.ink};stroke-width:.6;opacity:.65}.heatmap3d__axis text,.heatmap3d__labels text,.heatmap3d__static-legend text{fill:${preset.ink};font-family:sans-serif;font-size:8px}.heatmap3d__static-legend text{font-size:8px}`;
  const growRules = `.heatmap3d__cell[data-known="true"]{animation:${SCOPE}-grow 240ms cubic-bezier(.23,1,.32,1) both;animation-delay:calc(min(var(--heatmap3d-index,0),32) * 26ms);transform-box:fill-box;transform-origin:center bottom}`;
  const reducedRules = `.heatmap3d__cell[data-known="true"]{animation:${SCOPE}-reduced-fade 160ms ease-out both;animation-delay:0ms;transform:none}`;
  const scope = `.${SCOPE}`;
  const staticStyle = `<style>${scopeRules(baseRules, scope)}${animation === "grow" ? `@keyframes ${SCOPE}-grow{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes ${SCOPE}-reduced-fade{from{opacity:.45}to{opacity:1}}${scopeRules(growRules, scope)}@media (prefers-reduced-motion:reduce){${scopeRules(reducedRules, scope)}}` : ""}</style>`;
  const patternMarkup = patternDefinitions.length > 0
    ? `<defs>${patternDefinitions.map(({ face, level, pattern }) => {
        const id = `${SCOPE}-pattern-${face}-${level}`;
        return `<pattern id="${id}" patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse" width="${pattern.width}" height="${pattern.bitmap.length}"><rect width="${pattern.width}" height="${pattern.bitmap.length}" fill="${escapeXml(pattern.background)}"/><path d="${patternPath(pattern)}" fill="${escapeXml(pattern.foreground)}"/></pattern>`;
      }).join("")}</defs>`
    : "";
  const axisTicks = [0, 0.5, 1].map((fraction) => {
    const tick = projectPoint({ ...axisCorner, z: maxHeight * fraction }, camera);
    const value = domain[0] + (domain[1] - domain[0]) * fraction;
    return `<g><line x1="${number(tick.x - 3)}" x2="${number(tick.x + 3)}" y1="${number(tick.y)}" y2="${number(tick.y)}"/><text x="${number(tick.x - 7)}" y="${number(tick.y + 3)}" text-anchor="end">${escapeXml(formatValue(value))}</text></g>`;
  }).join("");
  const floorMarkup = `<g class="heatmap3d__floor" aria-hidden="true"><path d="${polygonPath(floor.map((value) => ({ ...value, z: -5 })), camera)}" class="heatmap3d__floor-edge"/><path d="${polygonPath(floor, camera)}" class="heatmap3d__floor-surface"/>${Array.from({ length: Math.max(0, columns + 1) }, (_, index) => `<path d="${gridPath(point(index * step - width / 2 - gutter / 2, -depth / 2 - size / 2, -0.5), point(index * step - width / 2 - gutter / 2, depth / 2 + size / 2, -0.5), camera)}" class="heatmap3d__grid-line"/>`).join("")}${Array.from({ length: Math.max(0, rows + 1) }, (_, index) => `<path d="${gridPath(point(-width / 2 - size / 2, index * step - depth / 2 - gutter / 2, -0.5), point(width / 2 + size / 2, index * step - depth / 2 - gutter / 2, -0.5), camera)}" class="heatmap3d__grid-line"/>`).join("")}${geometry.filter((entry) => entry.height > 0).map((entry) => `<path d="${polygonPath(entry.geometry.footprint.map((value) => ({ ...value, x: value.x + size * 0.13, y: value.y + size * 0.13, z: -0.1 })), camera)}" class="heatmap3d__contact-shadow"/>`).join("")}</g>`;
  const labelsMarkup = `<g class="heatmap3d__labels" aria-hidden="true">${rowLabels?.slice(0, rows).map((text, index) => {
    const position = rowLabelPosition(index);
    return `<text x="${number(position.x)}" y="${number(position.y + 3)}" text-anchor="${rowAnchor}">${escapeXml(text)}</text>`;
  }).join("") ?? ""}${columnLabels?.map((entry) => {
    if (entry.column < 0 || entry.column >= columns) return "";
    const position = columnLabelPosition(entry.column);
    return `<text x="${number(position.x)}" y="${number(position.y + 10)}" text-anchor="middle">${escapeXml(entry.text)}</text>`;
  }).join("") ?? ""}</g>`;
  const classNames = ["heatmap", "heatmap3d", "heatmap3d__scene", SCOPE, className].filter(Boolean).join(" ");
  const cellsMarkup = geometry.map((entry, motionIndex) => cellMarkup(entry, motionIndex, camera, visualOptions, cellLabel, unknownOpacity)).join("");
  const legendColors = heatmap3DLegendColors(visualOptions);
  const legendMarkup = showLegend && legendColors.length > 0
    ? `<g class="heatmap3d__static-legend" aria-label="Legend"><text x="${number(bounds.x + 4)}" y="${number(bounds.y + bounds.height - 4)}">less</text>${legendColors.map((color, index) => `<rect x="${number(bounds.x + 25 + index * 9)}" y="${number(bounds.y + bounds.height - 11)}" width="7" height="7" rx="1" fill="${escapeXml(color)}"/>`).join("")}<text x="${number(bounds.x + 25 + legendColors.length * 9 + 2)}" y="${number(bounds.y + bounds.height - 4)}">more</text></g>`
    : "";
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" class="${escapeXml(classNames)}" viewBox="${number(bounds.x)} ${number(bounds.y)} ${number(bounds.width)} ${number(bounds.height)}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto" role="img" aria-label="${escapeXml(label)}" data-total="${number(total)}" data-shape="${shape}" data-block-style="${blockStyle}" data-heatmap3d-theme="${theme}" data-material="${material}" data-animation="${animation}" data-interactive="false">${staticStyle}${patternMarkup}<g transform="translate(${number(sceneCenterX)} ${number(sceneCenterY)}) scale(${number(camera.zoom)}) translate(${-number(sceneCenterX)} ${-number(sceneCenterY)})">${floorMarkup}<g class="heatmap3d__axis" aria-hidden="true"><line x1="${number(axisBottom.x)}" y1="${number(axisBottom.y)}" x2="${number(axisTop.x)}" y2="${number(axisTop.y)}"/>${axisTicks}</g>${cellsMarkup}${labelsMarkup}${legendMarkup}</g></svg>`;
  return markup.split(SCOPE).join(`heatmap3d-static-${hash(markup)}`);
}
