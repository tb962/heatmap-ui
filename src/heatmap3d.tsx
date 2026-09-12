"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { buildCells } from "./grid.js";
import { resolve3DTheme } from "./colors.js";
import { clamp, DEFAULT_CAMERA, normalizeCamera, polygonPath, projectPoint, resolveHeightDomain, type Point3D } from "./projection3d.js";
import { buildHeatmap3DScene, cameraDirection, point, rectangle, type Heatmap3DFaceGeometry } from "./heatmap3d-scene.js";
import { patternPath } from "./heatmap3d-patterns.js";
import { heatmap3DLegendColors, resolveHeatmap3DPattern, resolveHeatmap3DVisual, type Heatmap3DVisualOptions } from "./heatmap3d-visuals.js";
import type { Heatmap3DCamera, Heatmap3DProps, ResolvedCell } from "./types.js";
const keyFor = (cell: ResolvedCell) => `${cell.row}:${cell.column}`;
const finitePositive = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, value) : fallback;

function Surface({ face, camera, color, patternId }: { face: Heatmap3DFaceGeometry; camera: Heatmap3DCamera; color: string; patternId?: string }) {
  const path = polygonPath(face.points, camera);
  return <g>
    {patternId ? <path d={path} fill={color} className="heatmap3d__surface heatmap3d__surface-base" data-face={face.face} pointerEvents="none" /> : null}
    <path d={path} fill={patternId ? `url(#${patternId})` : color} className="heatmap3d__surface" data-face={face.face} data-material={patternId ? "pattern" : "solid"} />
    <path d={path} fill={face.shade >= 0 ? "#fff" : "#071b19"} opacity={Math.abs(face.shade)} pointerEvents="none" />
    {face.windows?.map((window, index) => <path key={index} d={polygonPath(window, camera)} className="heatmap3d__window" opacity={index % 5 === 0 ? 0.2 : index % 3 === 0 ? 0.65 : 0.42} pointerEvents="none" />)}
  </g>;
}

/** An SVG city of values. Every tower's highest point is its numerical height;
 * detail never adds an unmeasured storey, and unknowns never become buildings. */
export function Heatmap3D({
  rows, columns, values, scale = "quantile", levels: levelsProp, thresholds,
  shape = "rectangle", blockStyle = "solid", cellSize = 13, gap = 3,
  theme: themeProp, material = "solid", patterns, faceColor, animation = "none",
  colors: colorsProp, emptyColor: emptyColorProp, unknownOpacity = 0.5,
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
  const cameraFrame = useRef<number | null>(null);
  const pendingCamera = useRef<Partial<Heatmap3DCamera> | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, align: "center" });
  const size = Math.max(1, finitePositive(cellSize, 13));
  const gutter = finitePositive(gap, 3);
  const maxHeight = finitePositive(maxHeightProp, 100);
  const theme = themeProp ?? "green";
  const levels = Math.max(1, levelsProp ?? colorsProp?.length ?? 4);
  const emptyColor = emptyColorProp ?? resolve3DTheme(theme).emptyColor;
  const visualOptions: Heatmap3DVisualOptions = {
    theme,
    material,
    colors: colorsProp,
    emptyColor,
    patterns,
    faceColor,
    levels,
    columns,
    patternPrefix: `heatmap3d-pattern-${instanceId}`,
  };
  const legendColors = heatmap3DLegendColors(visualOptions);
  const patternDefinitions = material === "pattern"
    ? (["top", "left", "right"] as const).flatMap(face => Array.from({ length: levels }, (_, index) => {
        const pattern = resolveHeatmap3DPattern({ face, level: index + 1, options: visualOptions });
        return { face, level: index + 1, pattern };
      }))
    : [];
  const { cells, total, unknownCount } = useMemo(() => buildCells({ rows, columns, values, scale, levels, thresholds, isSlotHidden }), [rows, columns, values, scale, levels, thresholds, isSlotHidden]);
  const domain = useMemo(() => resolveHeightDomain(cells, heightDomain), [cells, heightDomain]);
  const step = size + gutter;
  const width = Math.max(size, columns * step - gutter);
  const depth = Math.max(size, rows * step - gutter);
  const facing = cameraDirection(camera);
  const rowEdge = facing.x > 0.001 ? 1 : -1;
  const columnEdge = facing.y >= 0 ? 1 : -1;
  const rowOutward = rowEdge * Math.cos(camera.yaw * Math.PI / 180);
  const rowAnchor = Math.abs(rowOutward) < 0.3 ? "middle" : rowOutward > 0 ? "start" : "end";
  const rowLabelPosition = (index: number) => projectPoint(point(rowEdge * (width / 2 + size), index * step + size / 2 - depth / 2, 0), camera);
  const columnLabelPosition = (column: number) => projectPoint(point(column * step + size / 2 - width / 2, columnEdge * (depth / 2 + size), 0), camera);
  // Keep the numeric ruler at the screen-left corner, clear of the towers.
  const axisCorner = point(
    (Math.cos(camera.yaw * Math.PI / 180) >= 0 ? -1 : 1) * (width / 2 + size),
    (facing.x >= 0 ? 1 : -1) * (depth / 2 + size), 0,
  );
  const geometry = useMemo(() => buildHeatmap3DScene({
    cells, cellSize: size, gap: gutter, width, depth, domain,
    maxHeight, shape, blockStyle, camera,
  }), [cells, size, gutter, width, depth, domain, maxHeight, shape, blockStyle, camera.yaw, camera.pitch]);
  // Fit the drawn scene rather than an orbit-sized sphere. Long grids deserve
  // the same generous canvas occupancy as square grids; every orientation is
  // fitted before zoom so the camera never clips a tower at its default zoom.
  const bounds = useMemo(() => {
    const points = rectangle(0, 0, width + size, depth + size, -5);
    for (const entry of geometry) {
      for (const p of entry.geometry.footprint) points.push({ ...p, z: entry.height });
    }
    points.push(axisCorner, { ...axisCorner, z: maxHeight });
    const projected = points.map(p => projectPoint(p, camera));
    if (rowLabels?.length) {
      rowLabels.slice(0, rows).forEach((text, index) => {
        const p = rowLabelPosition(index);
        const labelWidth = typeof text === "string" ? Math.max(24, text.length * 4.5) : 24;
        projected.push({ ...p, x: p.x + (rowAnchor === "end" ? -labelWidth : labelWidth), y: p.y + 10 });
      });
    }
    if (columnLabels?.length) {
      columnLabels.forEach(entry => {
        if (entry.column < 0 || entry.column >= columns) return;
        const p = columnLabelPosition(entry.column);
        const halfWidth = typeof entry.text === "string" ? Math.max(15, entry.text.length * 2.25) : 15;
        projected.push({ ...p, x: p.x - halfWidth, y: p.y + 16 }, { ...p, x: p.x + halfWidth, y: p.y + 16 });
      });
    }
    const extents = projected.reduce((range, p) => ({ minX: Math.min(range.minX, p.x), maxX: Math.max(range.maxX, p.x), minY: Math.min(range.minY, p.y), maxY: Math.max(range.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const minX = extents.minX - 20;
    const maxX = extents.maxX + 12;
    const minY = extents.minY - 15;
    const maxY = extents.maxY + 15;
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }, [geometry, width, depth, size, maxHeight, rowLabels, columnLabels, rows, columns, step, camera.yaw, camera.pitch]);
  const sceneCenterX = bounds.x + bounds.width / 2;
  const sceneCenterY = bounds.y + bounds.height / 2;
  const active = activeKey === null ? undefined : geometry.find(entry => keyFor(entry.cell) === activeKey);
  const content: ReactNode = active ? tooltip ? tooltip(active.cell) : <><span className="heatmap3d__tooltip-label">Row {active.cell.row + 1} · Column {active.cell.column + 1}</span><strong>{active.cell.known ? active.cell.value.toLocaleString() : "No data"}</strong></> : null;
  const label = ariaLabel ?? `3D heatmap, ${rows} by ${columns}, height represents value${unknownCount > 0 ? `, ${unknownCount} slots with no data` : ""}`;
  const focusableKey = focusedKey && cells.some(cell => keyFor(cell) === focusedKey) ? focusedKey : cells[0] ? keyFor(cells[0]) : null;

  useEffect(() => () => {
    if (cameraFrame.current !== null) window.cancelAnimationFrame(cameraFrame.current);
  }, []);

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
    // A release outside the SVG before pointer capture must not start a new
    // orbit when the pointer later re-enters the chart.
    if (event.pointerType !== "touch" && (event.buttons & 1) === 0) {
      pointerEnd(event);
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) {
      start.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    pendingCamera.current = { yaw: start.camera.yaw - dx * 0.35, pitch: start.camera.pitch + dy * 0.25 };
    if (cameraFrame.current === null) {
      cameraFrame.current = window.requestAnimationFrame(() => {
        cameraFrame.current = null;
        if (pendingCamera.current) changeCamera(pendingCamera.current);
        pendingCamera.current = null;
      });
    }
  }

  function pointerEnd(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || event.pointerId !== drag.current.id) return;
    if (cameraFrame.current !== null) window.cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = null;
    if (pendingCamera.current) changeCamera(pendingCamera.current);
    pendingCamera.current = null;
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
  const axisBottom = projectPoint(axisCorner, camera);
  const axisTop = projectPoint({ ...axisCorner, z: maxHeight }, camera);
  const gridPath = (a: Point3D, b: Point3D) => {
    const start = projectPoint(a, camera); const end = projectPoint(b, camera);
    return `M${start.x},${start.y} L${end.x},${end.y}`;
  };

  return <div className={["heatmap", "heatmap3d", className].filter(Boolean).join(" ")} ref={containerRef} role="group" aria-label={label} data-total={total} data-shape={shape} data-block-style={blockStyle} data-heatmap3d-theme={theme} data-material={material} data-animation={animation} style={style} {...rest}>
    <span id={instructionsId} className="heatmap3d__sr-only">Height shows the numerical value; colour shows its shade band. Zero and negative values are flat. Outlined tiles have no data. {interactive ? "Drag to orbit. Focus the chart and use arrow keys to rotate, plus or minus to zoom, and Home to reset. Tab to enter the grid, then use arrow keys to inspect adjacent cells." : "Tab to enter the grid, then use arrow keys to inspect adjacent cells."}</span>
    <svg className="heatmap3d__scene" viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="group" aria-label="3D chart" aria-describedby={instructionsId} tabIndex={interactive ? 0 : undefined} data-interactive={interactive} data-dragging={dragging} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={cameraKey}>
      {patternDefinitions.length > 0 ? <defs>
        {patternDefinitions.map(({ face, level, pattern }) => <pattern key={`${face}-${level}`} id={`${visualOptions.patternPrefix}-${face}-${level}`} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse" width={pattern.width} height={pattern.bitmap.length}>
          <rect width={pattern.width} height={pattern.bitmap.length} fill={pattern.background} />
          <path d={patternPath(pattern)} fill={pattern.foreground} />
        </pattern>)}
      </defs> : null}
      <g transform={`translate(${sceneCenterX} ${sceneCenterY}) scale(${camera.zoom}) translate(${-sceneCenterX} ${-sceneCenterY})`}>
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
            const value = domain[0] + (domain[1] - domain[0]) * fraction;
            return <g key={fraction}><line x1={tick.x - 3} x2={tick.x + 3} y1={tick.y} y2={tick.y} /><text x={tick.x - 7} y={tick.y + 3} textAnchor="end">{new Intl.NumberFormat(undefined, { notation: Math.abs(value) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value)}</text></g>;
          })}
        </g>
        {geometry.map((entry, motionIndex) => {
          const { cell, geometry: mesh, height } = entry;
          const key = keyFor(cell);
          const visual = resolveHeatmap3DVisual({ cell, options: visualOptions });
          const name = cellLabel?.(cell) ?? `Row ${cell.row + 1}, column ${cell.column + 1}: ${cell.known ? cell.value : "no data"}`;
          return <g key={key} ref={node => { if (node) cellRefs.current.set(key, node); else cellRefs.current.delete(key); }} className="heatmap3d__cell" data-row={cell.row} data-column={cell.column} data-known={cell.known ? "true" : "false"} data-value={cell.value} data-height={height} data-level={cell.level} data-active={activeKey === key} data-material={material} style={{ "--heatmap3d-index": motionIndex } as CSSProperties} role={onCellClick ? "button" : "img"} aria-label={name} aria-describedby={activeKey === key && content ? tooltipId : undefined} tabIndex={focusableKey === key ? 0 : -1} onPointerEnter={event => showCell(cell, event.currentTarget, event)} onPointerLeave={() => setActiveKey(current => current === key ? null : current)} onFocus={event => { setFocusedKey(key); showCell(cell, event.currentTarget); }} onBlur={() => setActiveKey(current => current === key ? null : current)} onKeyDown={event => cellKey(event, cell)} onClick={onCellClick ? () => { if (!suppressClick.current) onCellClick(cell); } : undefined}>
            <title>{name}</title>
            {!cell.known ? <path d={polygonPath(mesh.footprint, camera)} fill="transparent" className="heatmap3d__unknown" opacity={unknownOpacity} /> : <>
              {mesh.faces.map((face, index) => <Surface key={index} face={face} camera={camera} color={visual.faceColor(face.face)} patternId={visual.patternId(face.face)} />)}
              {mesh.roof ? <path d={polygonPath(mesh.roof, camera)} className="heatmap3d__roof" /> : null}
              {mesh.studs.map((faces, index) => <g key={index}>{faces.map((face, faceIndex) => <Surface key={faceIndex} face={face} camera={camera} color={visual.faceColor(face.face)} patternId={visual.patternId(face.face)} />)}</g>)}
            </>}
          </g>;
        })}
        <g className="heatmap3d__labels" aria-hidden="true">
          {rowLabels?.map((text, index) => {
            if (index >= rows) return null;
            const position = rowLabelPosition(index);
            return <text key={index} x={position.x} y={position.y + 3} textAnchor={rowAnchor}>{text}</text>;
          })}
          {columnLabels?.map((entry, index) => {
            if (entry.column < 0 || entry.column >= columns) return null;
            const position = columnLabelPosition(entry.column);
            return <text key={index} x={position.x} y={position.y + 10} textAnchor="middle">{entry.text}</text>;
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
    {showLegend ? <div className="heatmap__legend heatmap3d__legend"><span>{legendLabels?.less ?? "less"}</span><span className="heatmap__legend-swatch" style={{ background: emptyColor }} />{legendColors.map((color, index) => <span key={index} className="heatmap__legend-swatch" style={{ background: color }} />)}<span>{legendLabels?.more ?? "more"}</span>{unknownCount > 0 ? <><span className="heatmap__legend-unknown">{legendLabels?.unknown ?? "no data"}</span><span className="heatmap3d__legend-unknown-swatch" /></> : null}</div> : null}
  </div>;
}

export default Heatmap3D;
