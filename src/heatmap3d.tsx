"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { buildCells } from "./grid.js";
import { clamp, DEFAULT_CAMERA, normalizeCamera, polygonPath, projectPoint, projectionBounds, resolveHeightDomain, valueToHeight, type Point3D } from "./projection3d.js";
import type { Heatmap3DCamera, Heatmap3DProps, ResolvedCell } from "./types.js";

const DEFAULT_COLORS = ["#9be9a8", "#40c463", "#30a14e", "#216e39"];
type Face = { points: Point3D[]; shade: number; windows?: Point3D[][] };
type ObjectGeometry = { faces: Face[]; studs: Face[][]; footprint: Point3D[]; roof?: Point3D[] };
type CellGeometry = { cell: ResolvedCell; x: number; y: number; height: number; depth: number; geometry: ObjectGeometry };
const point = (x: number, y: number, z: number): Point3D => ({ x, y, z });
const cameraDirection = (camera: Heatmap3DCamera) => ({ x: Math.sin(camera.yaw * Math.PI / 180), y: Math.cos(camera.yaw * Math.PI / 180) });
const keyFor = (cell: ResolvedCell) => `${cell.row}:${cell.column}`;
const finitePositive = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, value) : fallback;

function rectangle(x: number, y: number, width: number, depth: number, z: number) {
  return [point(x - width / 2, y - depth / 2, z), point(x + width / 2, y - depth / 2, z), point(x + width / 2, y + depth / 2, z), point(x - width / 2, y + depth / 2, z)];
}

function circle(x: number, y: number, radius: number, z: number, segments = 24) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z);
  });
}

function extrude(footprint: Point3D[], base: number, height: number, camera: Heatmap3DCamera, building = false): Face[] {
  const direction = cameraDirection(camera);
  const faces: Face[] = [];
  if (height > base) {
    footprint.forEach((a, index) => {
      const b = footprint[(index + 1) % footprint.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const normal = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
      if (normal.x * direction.x + normal.y * direction.y <= 0.00001) return;
      const windows: Point3D[][] = [];
      if (building && height > 5) {
        const windowColumns = Math.max(1, Math.min(3, Math.floor(length / 5)));
        const floors = Math.max(1, Math.min(12, Math.floor(height / 7)));
        for (let floor = 0; floor < floors; floor += 1) {
          for (let column = 0; column < windowColumns; column += 1) {
            const left = (column + 0.28) / windowColumns;
            const right = (column + 0.66) / windowColumns;
            const low = base + (height - base) * (floor + 0.26) / floors;
            const high = base + (height - base) * (floor + 0.58) / floors;
            const at = (fraction: number, z: number) => point(a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction, z);
            windows.push([at(left, low), at(right, low), at(right, high), at(left, high)]);
          }
        }
      }
      faces.push({ points: [point(a.x, a.y, base), point(b.x, b.y, base), point(b.x, b.y, height), point(a.x, a.y, height)], shade: -0.14 - normal.x * 0.12 - normal.y * 0.12, windows });
    });
  }
  faces.push({ points: footprint.map(p => ({ ...p, z: height })), shade: 0.14 });
  return faces;
}

function geometryFor(x: number, y: number, size: number, height: number, shape: NonNullable<Heatmap3DProps["shape"]>, blockStyle: NonNullable<Heatmap3DProps["blockStyle"]>, camera: Heatmap3DCamera): ObjectGeometry {
  const width = size * (shape === "bar" ? 0.42 : 0.94);
  const depth = size * 0.94;
  const footprint = shape === "circle" ? circle(x, y, size * 0.47, 0) : rectangle(x, y, width, depth, 0);
  const studHeight = blockStyle === "lego" ? Math.min(size * 0.15, height * 0.2) : 0;
  const faces = extrude(footprint, 0, height - studHeight, camera, blockStyle === "building");
  const studs: Face[][] = [];
  if (studHeight > 0) {
    const positions = shape === "circle" ? [[x, y]] : shape === "bar" ? [[x, y - depth * 0.24], [x, y + depth * 0.24]] : [[x - width * 0.24, y - depth * 0.24], [x + width * 0.24, y - depth * 0.24], [x - width * 0.24, y + depth * 0.24], [x + width * 0.24, y + depth * 0.24]];
    positions.sort((a, b) => projectPoint(point(a[0], a[1], 0), camera).depth - projectPoint(point(b[0], b[1], 0), camera).depth);
    positions.forEach(([sx, sy]) => studs.push(extrude(circle(sx, sy, size * (shape === "circle" ? 0.24 : 0.135), height - studHeight, 12), height - studHeight, height, camera)));
  }
  const roof = blockStyle === "building" && height > 0
    ? shape === "circle" ? circle(x, y, size * 0.34, height) : rectangle(x, y, width * 0.76, depth * 0.76, height)
    : undefined;
  return { faces, studs, footprint, roof };
}

function Surface({ face, camera, color }: { face: Face; camera: Heatmap3DCamera; color: string }) {
  const path = polygonPath(face.points, camera);
  return <g>
    <path d={path} fill={color} className="heatmap3d__surface" />
    <path d={path} fill={face.shade >= 0 ? "#fff" : "#071b19"} opacity={Math.abs(face.shade)} pointerEvents="none" />
    {face.windows?.map((window, index) => <path key={index} d={polygonPath(window, camera)} className="heatmap3d__window" opacity={index % 5 === 0 ? 0.2 : index % 3 === 0 ? 0.65 : 0.42} pointerEvents="none" />)}
  </g>;
}

/** An SVG city of values. Every tower's highest point is its numerical height;
 * detail never adds an unmeasured storey, and unknowns never become buildings. */
export function Heatmap3D({
  rows, columns, values, scale = "quantile", levels: levelsProp, thresholds,
  shape = "rectangle", blockStyle = "solid", cellSize = 13, gap = 3,
  colors = DEFAULT_COLORS, emptyColor = "#e5e9e7", unknownOpacity = 0.5,
  maxHeight: maxHeightProp = 100, heightDomain, yaw, pitch, zoom, onCameraChange,
  interactive = true, showControls = true, rowLabels, columnLabels,
  tooltip, cellLabel, onCellClick, isSlotHidden, showLegend = false, legendLabels,
  ariaLabel, className, style, ...rest
}: Heatmap3DProps) {
  const instanceId = useId().replace(/:/g, "");
  const tooltipId = `heatmap3d-tooltip-${instanceId}`;
  const instructionsId = `heatmap3d-instructions-${instanceId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, SVGGElement>());
  const [localCamera, setLocalCamera] = useState<Heatmap3DCamera>(() => normalizeCamera({ yaw, pitch, zoom }));
  const camera = normalizeCamera({ yaw: yaw ?? localCamera.yaw, pitch: pitch ?? localCamera.pitch, zoom: zoom ?? localCamera.zoom });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; camera: Heatmap3DCamera; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, align: "center" });
  const size = Math.max(1, finitePositive(cellSize, 13));
  const gutter = finitePositive(gap, 3);
  const maxHeight = finitePositive(maxHeightProp, 100);
  const levels = Math.max(1, levelsProp ?? colors.length);
  const { cells, total, unknownCount } = useMemo(() => buildCells({ rows, columns, values, scale, levels, thresholds, isSlotHidden }), [rows, columns, values, scale, levels, thresholds, isSlotHidden]);
  const domain = useMemo(() => resolveHeightDomain(cells, heightDomain), [cells, heightDomain]);
  const step = size + gutter;
  const width = Math.max(size, columns * step - gutter);
  const depth = Math.max(size, rows * step - gutter);
  const bounds = projectionBounds(width + size * 2, depth + size * 2, maxHeight);
  const sceneCenterY = bounds.y + bounds.height / 2;
  const geometry = useMemo(() => cells.map((cell): CellGeometry => {
    const x = cell.column * step + size / 2 - width / 2;
    const y = cell.row * step + size / 2 - depth / 2;
    const height = cell.known ? valueToHeight(cell.value, domain, maxHeight) : 0;
    return { cell, x, y, height, depth: projectPoint(point(x, y, 0), camera).depth, geometry: geometryFor(x, y, size, height, shape, blockStyle, camera) };
  }).sort((a, b) => a.depth - b.depth || a.cell.row - b.cell.row || a.cell.column - b.cell.column), [cells, step, size, width, depth, domain, maxHeight, shape, blockStyle, camera.yaw, camera.pitch]);
  const active = activeKey === null ? undefined : geometry.find(entry => keyFor(entry.cell) === activeKey);
  const content: ReactNode = active ? tooltip ? tooltip(active.cell) : <><span className="heatmap3d__tooltip-label">Row {active.cell.row + 1} · Column {active.cell.column + 1}</span><strong>{active.cell.known ? active.cell.value.toLocaleString() : "No data"}</strong></> : null;
  const label = ariaLabel ?? `3D heatmap, ${rows} by ${columns}, height represents value${unknownCount > 0 ? `, ${unknownCount} slots with no data` : ""}`;
  const focusableKey = focusedKey && cells.some(cell => keyFor(cell) === focusedKey) ? focusedKey : cells[0] ? keyFor(cells[0]) : null;

  function changeCamera(next: Partial<Heatmap3DCamera>) {
    const resolved = normalizeCamera({ ...cameraRef.current, ...next });
    cameraRef.current = resolved;
    setLocalCamera(resolved);
    setActiveKey(null);
    onCameraChange?.(resolved);
  }

  function showCell(cell: ResolvedCell, target: SVGGElement, pointer?: { clientX: number; clientY: number }) {
    if (drag.current?.moved) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const box = target.getBoundingClientRect();
    const x = clamp((pointer?.clientX ?? (box.left + box.width / 2)) - rect.left, 16, rect.width - 16);
    const y = clamp((pointer?.clientY ?? box.top) - rect.top, 40, rect.height - 8);
    setTooltipPosition({ x, y, align: x < 120 ? "start" : x > rect.width - 120 ? "end" : "center" });
    setActiveKey(keyFor(cell));
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!interactive || !event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: cameraRef.current, moved: false };
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) {
      start.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    changeCamera({ yaw: start.camera.yaw - dx * 0.35, pitch: start.camera.pitch + dy * 0.25 });
  }

  function pointerEnd(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || event.pointerId !== drag.current.id) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cameraKey(event: KeyboardEvent<SVGSVGElement>) {
    if (!interactive || event.target !== event.currentTarget) return;
    const directions: Record<string, Partial<Heatmap3DCamera>> = {
      ArrowLeft: { yaw: camera.yaw - 10 }, ArrowRight: { yaw: camera.yaw + 10 },
      ArrowUp: { pitch: camera.pitch + 5 }, ArrowDown: { pitch: camera.pitch - 5 },
      "+": { zoom: camera.zoom + 0.1 }, "=": { zoom: camera.zoom + 0.1 }, "-": { zoom: camera.zoom - 0.1 },
      Home: DEFAULT_CAMERA, "0": DEFAULT_CAMERA,
    };
    if (directions[event.key]) { event.preventDefault(); changeCamera(directions[event.key]); }
    if (event.key === "Escape") setActiveKey(null);
  }

  function cellKey(event: KeyboardEvent<SVGGElement>, cell: ResolvedCell) {
    if (event.key === "Escape") { setActiveKey(null); return; }
    if (onCellClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onCellClick(cell); return; }
    const direction = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (!direction) return;
    event.preventDefault();
    let row = cell.row + direction[0];
    let column = cell.column + direction[1];
    while (row >= 0 && row < rows && column >= 0 && column < columns) {
      const target = cellRefs.current.get(`${row}:${column}`);
      if (target) { target.focus(); break; }
      row += direction[0]; column += direction[1];
    }
  }

  const floor = rectangle(0, 0, width + size, depth + size, -1);
  const axisCorner = point(-width / 2 - size * 0.8, depth / 2 + size * 0.8, 0);
  const axisBottom = projectPoint(axisCorner, camera);
  const axisTop = projectPoint({ ...axisCorner, z: maxHeight }, camera);
  const gridPath = (a: Point3D, b: Point3D) => {
    const start = projectPoint(a, camera); const end = projectPoint(b, camera);
    return `M${start.x},${start.y} L${end.x},${end.y}`;
  };

  return <div className={["heatmap", "heatmap3d", className].filter(Boolean).join(" ")} ref={containerRef} role="group" aria-label={label} data-total={total} data-shape={shape} data-block-style={blockStyle} style={style} {...rest}>
    <span id={instructionsId} className="heatmap3d__sr-only">Height shows the numerical value; colour shows its shade band. Zero and negative values are flat. Outlined tiles have no data. {interactive ? "Drag to orbit. Focus the chart and use arrow keys to rotate, plus or minus to zoom, and Home to reset. Tab to enter the grid, then use arrow keys to inspect adjacent cells." : "Tab to enter the grid, then use arrow keys to inspect adjacent cells."}</span>
    <svg className="heatmap3d__scene" viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="group" aria-label="3D chart" aria-describedby={instructionsId} tabIndex={interactive ? 0 : undefined} data-interactive={interactive} data-dragging={dragging} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={cameraKey}>
      <g transform={`translate(0 ${sceneCenterY}) scale(${camera.zoom}) translate(0 ${-sceneCenterY})`}>
        <g className="heatmap3d__floor" aria-hidden="true">
          <path d={polygonPath(floor.map(p => ({ ...p, z: -5 })), camera)} className="heatmap3d__floor-edge" />
          <path d={polygonPath(floor, camera)} className="heatmap3d__floor-surface" />
          {Array.from({ length: Math.max(0, columns + 1) }, (_, index) => <path key={`c${index}`} d={gridPath(point(index * step - width / 2 - gutter / 2, -depth / 2 - size / 2, -0.5), point(index * step - width / 2 - gutter / 2, depth / 2 + size / 2, -0.5))} className="heatmap3d__grid-line" />)}
          {Array.from({ length: Math.max(0, rows + 1) }, (_, index) => <path key={`r${index}`} d={gridPath(point(-width / 2 - size / 2, index * step - depth / 2 - gutter / 2, -0.5), point(width / 2 + size / 2, index * step - depth / 2 - gutter / 2, -0.5))} className="heatmap3d__grid-line" />)}
          {geometry.filter(entry => entry.height > 0).map(entry => <path key={keyFor(entry.cell)} d={polygonPath(entry.geometry.footprint.map(p => ({ ...p, x: p.x + size * 0.13, y: p.y + size * 0.13, z: -0.1 })), camera)} className="heatmap3d__contact-shadow" />)}
        </g>
        <g className="heatmap3d__axis" aria-hidden="true">
          <line x1={axisBottom.x} y1={axisBottom.y} x2={axisTop.x} y2={axisTop.y} />
          {[0, 0.5, 1].map(fraction => {
            const tick = projectPoint({ ...axisCorner, z: maxHeight * fraction }, camera);
            const value = fraction === 0 ? 0 : domain[0] + (domain[1] - domain[0]) * fraction;
            return <g key={fraction}><line x1={tick.x - 3} x2={tick.x + 3} y1={tick.y} y2={tick.y} /><text x={tick.x - 7} y={tick.y + 3} textAnchor="end">{new Intl.NumberFormat(undefined, { notation: Math.abs(value) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value)}</text></g>;
          })}
        </g>
        {geometry.map(entry => {
          const { cell, geometry: mesh, height } = entry;
          const key = keyFor(cell);
          const color = cell.level > 0 && colors.length ? colors[Math.min(colors.length - 1, cell.level - 1)] : emptyColor;
          const name = cellLabel?.(cell) ?? `Row ${cell.row + 1}, column ${cell.column + 1}: ${cell.known ? cell.value : "no data"}`;
          return <g key={key} ref={node => { if (node) cellRefs.current.set(key, node); else cellRefs.current.delete(key); }} className="heatmap3d__cell" data-row={cell.row} data-column={cell.column} data-known={cell.known ? "true" : "false"} data-value={cell.value} data-height={height} data-level={cell.level} data-active={activeKey === key} role={onCellClick ? "button" : "img"} aria-label={name} aria-describedby={activeKey === key && content ? tooltipId : undefined} tabIndex={focusableKey === key ? 0 : -1} onPointerEnter={event => showCell(cell, event.currentTarget, event)} onPointerLeave={() => setActiveKey(current => current === key ? null : current)} onFocus={event => { setFocusedKey(key); showCell(cell, event.currentTarget); }} onBlur={() => setActiveKey(current => current === key ? null : current)} onKeyDown={event => cellKey(event, cell)} onClick={onCellClick ? () => { if (!suppressClick.current) onCellClick(cell); } : undefined}>
            <title>{name}</title>
            {!cell.known ? <path d={polygonPath(mesh.footprint, camera)} fill="transparent" className="heatmap3d__unknown" opacity={unknownOpacity} /> : <>
              {mesh.faces.map((face, index) => <Surface key={index} face={face} camera={camera} color={color} />)}
              {mesh.roof ? <path d={polygonPath(mesh.roof, camera)} className="heatmap3d__roof" /> : null}
              {mesh.studs.map((faces, index) => <g key={index}>{faces.map((face, faceIndex) => <Surface key={faceIndex} face={face} camera={camera} color={color} />)}</g>)}
            </>}
          </g>;
        })}
        <g className="heatmap3d__labels" aria-hidden="true">
          {rowLabels?.map((text, index) => {
            if (index >= rows) return null;
            const position = projectPoint(point(-width / 2 - size * 0.7, index * step + size / 2 - depth / 2, 0), camera);
            return <text key={index} x={position.x} y={position.y + 3} textAnchor="end">{text}</text>;
          })}
          {columnLabels?.map((entry, index) => {
            if (entry.column < 0 || entry.column >= columns) return null;
            const position = projectPoint(point(entry.column * step + size / 2 - width / 2, -depth / 2 - size * 0.7, 0), camera);
            return <text key={index} x={position.x} y={position.y - 4} textAnchor="middle">{entry.text}</text>;
          })}
        </g>
      </g>
    </svg>
    {active && content ? <div id={tooltipId} role="tooltip" className="heatmap__tooltip heatmap3d__tooltip" data-align={tooltipPosition.align} style={{ left: tooltipPosition.x, top: tooltipPosition.y }}>{content}</div> : null}
    {showControls && interactive ? <div className="heatmap3d__controls" aria-label="Chart camera controls">
      <button type="button" aria-label="Zoom out" disabled={camera.zoom <= 0.55} onClick={() => changeCamera({ zoom: camera.zoom - 0.15 })}>−</button>
      <button type="button" className="heatmap3d__reset" aria-label="Reset 3D view" onClick={() => changeCamera(DEFAULT_CAMERA)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6A5.5 5.5 0 1 1 2.7 10M2.5 2.5V6H6" /></svg></button>
      <button type="button" aria-label="Zoom in" disabled={camera.zoom >= 2} onClick={() => changeCamera({ zoom: camera.zoom + 0.15 })}>+</button>
    </div> : null}
    {showLegend ? <div className="heatmap__legend heatmap3d__legend"><span>{legendLabels?.less ?? "less"}</span><span className="heatmap__legend-swatch" style={{ background: emptyColor }} />{colors.map((color, index) => <span key={index} className="heatmap__legend-swatch" style={{ background: color }} />)}<span>{legendLabels?.more ?? "more"}</span>{unknownCount > 0 ? <><span className="heatmap__legend-unknown">{legendLabels?.unknown ?? "no data"}</span><span className="heatmap3d__legend-unknown-swatch" /></> : null}</div> : null}
  </div>;
}

export default Heatmap3D;
