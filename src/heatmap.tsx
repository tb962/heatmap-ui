"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { luminance, parseHex } from "./colors.js";
import { buildCells } from "./grid.js";
import { fillStyle, isRoundShape, rowOffset, rowSpacing, shapeStyle } from "./shapes.js";
import type { HeatmapProps, ResolvedCell } from "./types.js";

/** GitHub's light ramp, as a neutral default rather than a statement. */
const DEFAULT_COLORS = ["#9be9a8", "#40c463", "#30a14e", "#216e39"] as const;
const DEFAULT_EMPTY = "#ebedf0";
const TOOLTIP_DELAY = 300;
const TOOLTIP_OFFSET = 8;
const COLUMN_LABEL_HEIGHT = 16;

// Measuring has to happen before paint, but the server has no layout to read.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Columns of a given pitch that fit in `available` pixels. */
export function fittingColumns(available: number, columnWidth: number, gap: number, overhang = 0) {
  if (!(available > 0) || !(columnWidth > 0)) return 0;
  // The epsilon absorbs float error, so a grid that fits exactly is not a column short.
  return Math.max(0, Math.floor((available + gap - overhang) / columnWidth + 1e-6));
}

/** Props the calendar passes to the grid, not part of the public API. */
export type HeatmapViewProps = HeatmapProps & {
  /** Which end of an overflowing grid is in view first. Defaults to "start". */
  scrollAnchor?: "start" | "end";
  /** Stretches the chart to its container and reports how many columns fit. */
  onFitColumns?: (columns: number) => void;
};

export function Heatmap(props: HeatmapProps) {
  return <HeatmapView {...props} />;
}

/** @internal */
export function HeatmapView({
  rows,
  columns,
  values,
  scale = "linear",
  levels: levelsProp,
  thresholds: thresholdsProp,
  shape = "rounded",
  encode = "color",
  cellSize = 13,
  cellWidth: cellWidthProp,
  cellHeight: cellHeightProp,
  gap = 3,
  radius,
  colors = DEFAULT_COLORS,
  emptyColor = DEFAULT_EMPTY,
  cellColor,
  unknownOpacity = 0.5,
  minScale = 0.35,
  rowLabels,
  columnLabels,
  tooltip,
  cellContent,
  cellLabel,
  onCellClick,
  isSlotHidden,
  showLegend = false,
  legendLabels,
  overflow = "scroll",
  scrollAnchor = "start",
  onFitColumns,
  ariaLabel,
  className,
  style,
  ...rest
}: HeatmapViewProps) {
  const levels = levelsProp ?? colors.length ?? 4;
  const { cells, total, unknownCount } = useMemo(
    () =>
      buildCells({
        rows,
        columns,
        values,
        scale,
        levels,
        thresholds: thresholdsProp,
        isSlotHidden,
      }),
    [rows, columns, values, scale, levels, thresholdsProp, isSlotHidden],
  );

  const cellWidth = cellWidthProp ?? cellSize;
  const cellHeight = cellHeightProp ?? cellSize;
  const columnWidth = cellWidth + gap;
  const rowHeight = rowSpacing(shape, cellHeight, gap);
  // Hexagon rows are offset by half a column, so the grid is that much wider.
  const overhang = shape === "hexagon" && rows > 1 ? columnWidth / 2 : 0;
  const width = columns * columnWidth - gap + overhang;
  const height = (rows - 1) * rowHeight + cellHeight;

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Null until measured, which the server never is.
  const [overflowing, setOverflowing] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;

    const measure = () => {
      // A container that is not laid out (display: none, a closed tab) has
      // no width to fit; keep the last answer rather than collapse the grid.
      if (viewport.clientWidth === 0) return;
      // The start padding is room for focus rings, not for cells. The end
      // padding only exists while scrolling, so it is not subtracted.
      const available = viewport.clientWidth - parseFloat(getComputedStyle(viewport).paddingLeft);
      onFitColumns?.(fittingColumns(available, columnWidth, gap, overhang));
      setOverflowing(canvas.getBoundingClientRect().width > available + 0.5);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [onFitColumns, columnWidth, gap, overhang, width]);

  // Unmeasured, the grid is assumed to overflow: clipping and anchoring a grid
  // that turns out to fit is harmless, spilling one past its container is not.
  const clipped = overflow === "scroll" && overflowing !== false;
  // A scrolled grid must be reachable by keyboard. Focusable cells scroll it
  // into view themselves; a grid of plain cells needs the viewport focusable.
  const keyboardScroll =
    overflow === "scroll" && overflowing === true && !(tooltip || cellLabel || onCellClick);

  const visibleColumnLabels = columnLabels && columnLabels.length > 0 ? columnLabels : null;
  const label =
    ariaLabel ??
    "Heatmap, " + rows + " by " + columns +
    (unknownCount > 0 ? ", " + unknownCount + " slots with no data" : "");

  return (
    <div
      className={["heatmap", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
      data-total={total}
      data-overflow={overflow}
      data-fit={onFitColumns ? "true" : undefined}
      style={style}
      {...rest}
    >
      <div className="heatmap__body">
        {rowLabels && rowLabels.length > 0 ? (
          <div
            className="heatmap__row-labels"
            style={{
              height,
              gridAutoRows: rowHeight,
              marginTop: visibleColumnLabels ? COLUMN_LABEL_HEIGHT : 0,
            }}
          >
            {rowLabels.map((text, index) => (
              <span key={index} className="heatmap__row-label" style={{ height: cellHeight }}>
                {text}
              </span>
            ))}
          </div>
        ) : null}

        <div
          ref={viewportRef}
          className="heatmap__viewport"
          data-anchor={scrollAnchor}
          data-scrolling={clipped ? "true" : undefined}
          tabIndex={keyboardScroll ? 0 : undefined}
        >
          <div ref={canvasRef} className="heatmap__canvas">
            {visibleColumnLabels ? (
              <div className="heatmap__column-labels" style={{ height: COLUMN_LABEL_HEIGHT, width }}>
                {visibleColumnLabels.map((entry, index) => (
                  <span
                    key={index}
                    className="heatmap__column-label"
                    style={{ left: entry.column * columnWidth + cellWidth / 2 }}
                  >
                    {entry.text}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="heatmap__grid" style={{ width, height }}>
              {cells.map((cell) => (
                <HeatmapCellView
                  key={cell.row + ":" + cell.column}
                  cell={cell}
                  left={cell.column * columnWidth + rowOffset(shape, cell.row, columnWidth)}
                  top={cell.row * rowHeight}
                  width={cellWidth}
                  height={cellHeight}
                  shape={shape}
                  encode={encode}
                  levels={levels}
                  radius={radius}
                  colors={colors}
                  emptyColor={emptyColor}
                  cellColor={cellColor}
                  unknownOpacity={unknownOpacity}
                  minScale={minScale}
                  tooltip={tooltip}
                  cellContent={cellContent}
                  cellLabel={cellLabel}
                  onCellClick={onCellClick}
                  nearLeftEdge={cell.column === 0}
                  nearRightEdge={cell.column === columns - 1}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {showLegend ? (
        <div className="heatmap__legend">
          <span>{legendLabels?.less ?? "less"}</span>
          <LegendSwatch
            color={emptyColor}
            shape={shape}
            width={cellWidth}
            height={cellHeight}
            radius={radius}
          />
          {colors.map((color, index) => (
            <LegendSwatch
              key={color + index}
              color={color}
              shape={shape}
              width={cellWidth}
              height={cellHeight}
              radius={radius}
            />
          ))}
          <span>{legendLabels?.more ?? "more"}</span>
          {unknownCount > 0 ? (
            <>
              <span className="heatmap__legend-unknown">
                {legendLabels?.unknown ?? "no data"}
              </span>
              <LegendSwatch
                color={emptyColor}
                shape={shape}
                width={cellWidth}
                height={cellHeight}
                radius={radius}
                opacity={unknownOpacity}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HeatmapCellView({
  cell,
  left,
  top,
  width,
  height,
  shape,
  encode,
  levels,
  radius,
  colors,
  emptyColor,
  cellColor,
  unknownOpacity,
  minScale,
  tooltip,
  cellContent,
  cellLabel,
  onCellClick,
  nearLeftEdge,
  nearRightEdge,
}: {
  cell: ResolvedCell;
  left: number;
  top: number;
  width: number;
  height: number;
  shape: HeatmapProps["shape"] & string;
  encode: NonNullable<HeatmapProps["encode"]>;
  levels: number;
  radius: HeatmapProps["radius"];
  colors: readonly string[];
  emptyColor: string;
  cellColor: HeatmapProps["cellColor"];
  unknownOpacity: number;
  minScale: number;
  tooltip: HeatmapProps["tooltip"];
  cellContent: HeatmapProps["cellContent"];
  cellLabel: HeatmapProps["cellLabel"];
  onCellClick: HeatmapProps["onCellClick"];
  nearLeftEdge: boolean;
  nearRightEdge: boolean;
}) {
  const tooltipId = useId();
  const timer = useRef<number | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Only rendered once open, which only happens in the browser.
  const topLayer = open && supportsPopover();

  // A scrolling grid clips its overflow, so a tooltip drawn inside it would be
  // cut off at the top row. The top layer escapes every ancestor's clipping
  // and transform while staying in the DOM, so theme variables still apply.
  useIsomorphicLayoutEffect(() => {
    const slot = slotRef.current;
    const tip = tooltipRef.current;
    if (!topLayer || !slot || !tip) return;
    tip.showPopover();
    placeTooltip(tip, slot);
    // A scroll or resize would leave it pointing at nothing.
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [topLayer]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const content = tooltip ? tooltip(cell) : null;
  const visualContent = cellContent ? cellContent(cell) : null;
  const hasVisualContent =
    visualContent !== null &&
    visualContent !== undefined &&
    visualContent !== false &&
    visualContent !== true &&
    visualContent !== "";
  const name = cellLabel ? cellLabel(cell) : undefined;
  const interactive = Boolean(content || name || onCellClick);

  const show = () => {
    if (!content) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setOpen(true);
      timer.current = null;
    }, TOOLTIP_DELAY);
  };
  const hide = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  };

  // "size" carries intensity through geometry so it survives in greyscale.
  const usesSize = encode === "size" || encode === "both";
  const usesColor = encode === "color" || encode === "both";
  const intensity = levels > 0 ? cell.level / levels : 0;
  const scaleFactor = usesSize && cell.level > 0 ? minScale + (1 - minScale) * intensity : 1;
  const rampColor = !cell.known
    ? emptyColor
    : cell.level === 0
      ? emptyColor
      : usesColor
        ? colors[Math.min(colors.length - 1, cell.level - 1)]
        : colors[colors.length - 1];
  const color = cellColor?.(cell) ?? rampColor;

  const minSide = Math.min(width, height);
  // Circles and rings would turn into ellipses, so they keep a square box.
  const boxWidth = isRoundShape(shape) ? minSide : width;
  const boxHeight = isRoundShape(shape) ? minSide : height;

  // `bar` derives its own height from the level, so the box size must not be
  // written afterwards — an explicit `height: undefined` would clobber it.
  const box: CSSProperties =
    shape === "bar"
      ? { width }
      : {
          width: Math.round(boxWidth * scaleFactor),
          height: Math.round(boxHeight * scaleFactor),
        };

  const fill: CSSProperties = {
    ...shapeStyle(shape, radius, width === height ? undefined : minSide),
    ...box,
    ...fillStyle(shape, cell.level, levels, color, shape === "bar" ? height : minSide),
  };
  const contentText =
    typeof visualContent === "string" || typeof visualContent === "number"
      ? String(visualContent)
      : "";
  const contentStyle: CSSProperties = {
    // Hex ramps can choose a readable ink automatically. CSS variables and
    // other non-hex colours fall back to the inherited colour, and a custom
    // node can still set its own.
    ...(parseHex(color)
      ? { color: luminance(color) > 0.18 ? "#171614" : "#ffffff" }
      : {}),
    ...(contentText
      ? {
          fontSize: Math.max(
            6,
            Math.min(11, minSide * 0.68 - Math.max(0, contentText.length - 2) * 1.1),
          ),
        }
      : {}),
  };

  return (
    <div
      ref={slotRef}
      className="heatmap__cell-slot"
      style={{ left, top, width, height }}
      data-known={cell.known ? "true" : "false"}
      data-level={cell.level}
      tabIndex={interactive ? 0 : undefined}
      // A generic div may not carry aria-label, so a labelled cell is an image
      // of its value, as in Heatmap3D. Unlabelled cells stay generic.
      role={onCellClick ? "button" : name ? "img" : undefined}
      aria-label={name}
      aria-describedby={open ? tooltipId : undefined}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={onCellClick ? () => onCellClick(cell) : undefined}
      onKeyDown={
        onCellClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onCellClick(cell);
              }
            }
          : undefined
      }
    >
      <div
        className="heatmap__cell"
        style={{ ...fill, opacity: cell.known ? 1 : unknownOpacity }}
      >
        {hasVisualContent ? (
          <span className="heatmap__cell-content" aria-hidden="true" style={contentStyle}>
            {visualContent}
          </span>
        ) : null}
      </div>
      {open && content ? (
        <div
          ref={tooltipRef}
          id={tooltipId}
          className="heatmap__tooltip"
          role="tooltip"
          popover={topLayer ? "manual" : undefined}
          data-align={
            topLayer ? undefined : nearLeftEdge ? "start" : nearRightEdge ? "end" : "center"
          }
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}

function supportsPopover() {
  return typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
}

/** Centres the tooltip above its cell, flipping below and clamping to the viewport. */
function placeTooltip(tip: HTMLElement, anchor: HTMLElement) {
  const cell = anchor.getBoundingClientRect();
  const { width, height } = tip.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const left = Math.min(
    Math.max(TOOLTIP_OFFSET, cell.left + cell.width / 2 - width / 2),
    Math.max(TOOLTIP_OFFSET, viewportWidth - width - TOOLTIP_OFFSET),
  );
  const above = cell.top - height - TOOLTIP_OFFSET;
  tip.style.left = left + "px";
  tip.style.top = (above >= 0 ? above : cell.bottom + TOOLTIP_OFFSET) + "px";
}

/*
 * The legend is a key, not data, so its swatches read a step below the cells
 * they describe. The step is proportional, and clamped so a swatch can never
 * outgrow its own cell however small the grid gets.
 */
function legendSwatchSize(size: number) {
  const target = Math.min(Math.round(size * 0.8), 12);
  return Math.max(1, Math.min(target, size - 1));
}

function LegendSwatch({
  color,
  shape,
  width,
  height,
  radius,
  opacity = 1,
}: {
  color: string;
  shape: HeatmapProps["shape"] & string;
  width: number;
  height: number;
  radius: HeatmapProps["radius"];
  opacity?: number;
}) {
  // A non-square swatch keeps the cell's proportions, sized off its long side.
  const round = isRoundShape(shape) || width === height;
  const long = legendSwatchSize(round ? Math.min(width, height) : Math.max(width, height));
  const swatchWidth = round || width > height ? long : Math.max(1, Math.round(long * (width / height)));
  const swatchHeight = round || height > width ? long : Math.max(1, Math.round(long * (height / width)));
  return (
    <span
      className="heatmap__legend-swatch"
      aria-hidden="true"
      style={{
        ...shapeStyle(shape, radius, round ? undefined : Math.min(swatchWidth, swatchHeight)),
        width: swatchWidth,
        height: swatchHeight,
        background: shape === "ring" ? "transparent" : color,
        border: shape === "ring" ? "2px solid " + color : undefined,
        opacity,
      }}
    />
  );
}

export default Heatmap;
