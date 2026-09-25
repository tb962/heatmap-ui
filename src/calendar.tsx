"use client";

import { useMemo, useState, type ReactNode } from "react";

import { HeatmapView } from "./heatmap.js";
import { Heatmap3D } from "./heatmap3d.js";
import type { Heatmap3DProps, HeatmapCell, HeatmapProps, ResolvedCell } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DEFAULT_WEEKS = 53;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type CalendarDay = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  value: number;
  /** false when the day is outside what the source could observe. */
  known?: boolean;
  meta?: unknown;
};

/**
 * How many weeks to show. A number is exact. "auto" shows as many as the
 * container fits, up to 53, dropping the oldest first. A range fits the same
 * way within its bounds, and scrolls once even `min` does not fit.
 * 3D charts scale rather than scroll, so they always show the maximum.
 */
export type CalendarWeeks = number | "auto" | { min?: number; max?: number };

type CalendarOptions = {
  values?: ReadonlyArray<CalendarDay>;
  /**
   * First day shown. With `from`, the range is exact: days outside it are not
   * drawn, `weeks` is ignored, and a range too wide for its container scrolls
   * rather than dropping any of it. A `from` after `to` shows `to` alone.
   */
  from?: string | Date;
  /** Last day shown. Defaults to today. */
  to?: string | Date;
  /** Defaults to 53. Ignored when `from` is set. */
  weeks?: CalendarWeeks;
  /** 0 = Sunday (default), 1 = Monday. */
  weekStart?: 0 | 1;
  showMonthLabels?: boolean;
  showWeekdayLabels?: boolean;
  /** Which weekday rows to label. Defaults to every other one. */
  weekdayLabelRows?: readonly number[];
  unitLabel?: string;
  tooltip?: (day: CalendarCell) => ReactNode;
  cellLabel?: (day: CalendarCell) => string;
};

type CalendarManagedProps =
  | "rows" | "columns" | "values" | "rowLabels" | "columnLabels" | "tooltip" | "cellLabel";

export type CalendarHeatmapProps = Omit<HeatmapProps, CalendarManagedProps> & CalendarOptions;

/** A calendar whose values rise into 3D columns, bricks or buildings. */
export type CalendarHeatmap3DProps = Omit<Heatmap3DProps, CalendarManagedProps> & CalendarOptions;

/** A resolved cell with its calendar date attached. */
export type CalendarCell = ResolvedCell & { date: string };

function toUtcMidnight(value: string | Date): Date {
  const date = typeof value === "string" ? parseIsoDate(value) : value;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function isoKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The ISO day of a date or date string, or null when it is missing or invalid. */
function dayKey(value: string | Date | undefined): string | null {
  if (value === undefined) return null;
  const day = toUtcMidnight(value);
  return Number.isNaN(day.getTime()) ? null : isoKey(day);
}

function startOfWeek(date: Date, weekStart: 0 | 1): Date {
  const weekday = (date.getUTCDay() - weekStart + 7) % 7;
  return new Date(date.getTime() - weekday * DAY_MS);
}

/** A week count as a whole number of at least one, or the fallback. */
function wholeWeeks(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : fallback;
}

/** Reads `weeks` as a range. A fixed count is a range of one. */
export function resolveWeeks(weeks: CalendarWeeks | undefined): {
  min: number;
  max: number;
  fit: boolean;
} {
  if (weeks === "auto" || (typeof weeks === "object" && weeks !== null)) {
    const range = weeks === "auto" ? {} : weeks;
    const min = wholeWeeks(range.min, 1);
    // A minimum above the maximum wins: it is the floor the caller asked for.
    return { min, max: Math.max(min, wholeWeeks(range.max, DEFAULT_WEEKS)), fit: true };
  }
  const count = wholeWeeks(weeks, DEFAULT_WEEKS);
  return { min: count, max: count, fit: false };
}

/**
 * Lays days onto the grid: one column per week, one row per weekday. This is
 * the only place in the package that knows what a date is.
 */
function useCalendarProps<Props extends CalendarOptions & Pick<HeatmapProps, "cellSize" | "gap"> & { cellWidth?: number }>(
  {
    values = [],
    from,
    to,
    // Resolved by the caller, which knows whether the chart can fit its container.
    weeks: _weeks,
    weekStart = 0,
    showMonthLabels = true,
    showWeekdayLabels = false,
    weekdayLabelRows = [1, 3, 5],
    unitLabel = "",
    tooltip,
    cellLabel,
    ...heatmapProps
  }: Props,
  weeks: number,
) {
  // Keyed by day, so a fresh Date each render (or "today") does not re-lay the grid.
  // An unreadable `to` means today and an unreadable `from` means none,
  // rather than a render that throws.
  const endKey = dayKey(to) ?? dayKey(new Date())!;
  const startKey = dayKey(from);

  const { cells, columns, columnLabels, dates, hidden } = useMemo(() => {
    const byDate = new Map(values.map((day) => [day.date, day]));
    const end = parseIsoDate(endKey);
    const start = startKey === null ? null : new Date(Math.min(parseIsoDate(startKey).getTime(), end.getTime()));

    // The grid ends on the week containing `end`, so the last column is
    // partial whenever today is not the last day of the week. With a start,
    // the first column is likewise the week containing it.
    const lastColumnStart = startOfWeek(end, weekStart);
    const firstColumnStart = start
      ? startOfWeek(start, weekStart)
      : new Date(lastColumnStart.getTime() - (weeks - 1) * WEEK_MS);
    const columnCount = start
      ? Math.round((lastColumnStart.getTime() - firstColumnStart.getTime()) / WEEK_MS) + 1
      : weeks;
    // More than a year repeats month names, so January says which year it is.
    const namesYears = columnCount > DEFAULT_WEEKS;

    const resolved: HeatmapCell[] = [];
    const dateByKey = new Map<string, string>();
    const hiddenSlots = new Set<string>();
    const labels: Array<{ column: number; text: string }> = [];
    let previousMonth = -1;

    for (let column = 0; column < columnCount; column += 1) {
      // Which month a column belongs to is a property of the calendar, not of
      // the data, so the label is derived from the date before any value is
      // looked up. Deriving it inside the cell loop lost the label whenever
      // the caller had supplied nothing for that column's first day. A column
      // is named for its first drawn day: the week holding 1 January starts
      // in December, but a range from 1 January should not open on "Dec".
      const columnStart = firstColumnStart.getTime() + column * WEEK_MS;
      const columnDate = new Date(start ? Math.max(columnStart, start.getTime()) : columnStart);
      const columnMonth = columnDate.getUTCMonth();
      if (columnMonth !== previousMonth) {
        const text = namesYears && columnMonth === 0
          ? String(columnDate.getUTCFullYear())
          : MONTHS[columnMonth];
        labels.push({ column, text });
        previousMonth = columnMonth;
      }

      for (let row = 0; row < 7; row += 1) {
        const date = new Date(columnStart + row * DAY_MS);
        // Days outside the range are not "no data", they are not in it at all.
        if (date.getTime() > end.getTime() || (start && date.getTime() < start.getTime())) {
          hiddenSlots.add(row + ":" + column);
          continue;
        }

        const key = isoKey(date);
        dateByKey.set(row + ":" + column, key);
        const day = byDate.get(key);
        if (!day) continue;

        resolved.push({
          row,
          column,
          value: day.value,
          known: day.known !== false,
          meta: day.meta,
        });
      }
    }

    return {
      cells: resolved,
      columns: columnCount,
      columnLabels: labels,
      dates: dateByKey,
      hidden: hiddenSlots,
    };
  }, [values, endKey, startKey, weeks, weekStart]);

  // A three-letter month is about 24px at the label's 10px font. When a month
  // starts too few columns after the previous label there is no room for both,
  // so the later one is dropped rather than drawn on top of its neighbour.
  const monthLabels = useMemo(() => {
    const stride =
      (heatmapProps.cellWidth ?? heatmapProps.cellSize ?? 13) + (heatmapProps.gap ?? 3);
    const minColumns = Math.ceil(30 / stride);
    const kept: Array<{ column: number; text: string }> = [];
    let lastColumn = Number.NEGATIVE_INFINITY;
    for (const label of columnLabels) {
      if (label.column - lastColumn < minColumns) {
        // The range usually starts partway through a month. When that stub
        // crowds the first whole month, the whole month keeps the label.
        if (kept.length === 1 && kept[0].column === 0) {
          kept[0] = label;
          lastColumn = label.column;
        }
        continue;
      }
      kept.push(label);
      lastColumn = label.column;
    }
    return kept;
  }, [columnLabels, heatmapProps.cellWidth, heatmapProps.cellSize, heatmapProps.gap]);

  const withDate = (cell: ResolvedCell): CalendarCell => ({
    ...cell,
    date: dates.get(cell.row + ":" + cell.column) ?? "",
  });

  const rowLabels = showWeekdayLabels
    ? Array.from({ length: 7 }, (_, row) =>
        weekdayLabelRows.includes(row) ? WEEKDAYS[(row + weekStart) % 7] : "",
      )
    : undefined;

  return {
    rows: 7,
    columns,
    values: cells,
    isSlotHidden: (row: number, column: number) => hidden.has(row + ":" + column),
    rowLabels,
    columnLabels: showMonthLabels ? monthLabels : undefined,
    tooltip: tooltip ? (cell: ResolvedCell) => tooltip(withDate(cell)) : undefined,
    cellLabel: (cell: ResolvedCell) => {
      const resolved = withDate(cell);
      if (cellLabel) return cellLabel(resolved);
      if (!resolved.date) return "";
      const readable = parseIsoDate(resolved.date).toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      if (!resolved.known) return readable + ". No data.";
      return readable + ". " + resolved.value + (unitLabel ? " " + unitLabel : "");
    },
    ...heatmapProps,
  };
}

/**
 * Lays days onto a flat grid, with one column per week. The newest week is
 * the one in view when the grid has to scroll.
 */
export function CalendarHeatmap(props: CalendarHeatmapProps) {
  const { min, max, fit: fitsWeeks } = resolveWeeks(props.weeks);
  // An exact range is never trimmed to fit; it scrolls instead.
  const fit = fitsWeeks && props.from === undefined;
  // Until the container is measured (and always on the server) the calendar
  // renders its maximum, scrolled to the newest week, so the first paint
  // shows the same recent weeks the fitted grid will.
  const [fitted, setFitted] = useState<number | null>(null);
  const weeks = fit && fitted !== null ? Math.min(max, Math.max(min, fitted)) : max;
  const heatmapProps = useCalendarProps(props, weeks);
  return (
    <HeatmapView
      {...heatmapProps}
      scrollAnchor="end"
      onFitColumns={fit ? setFitted : undefined}
    />
  );
}

/** Lays the same calendar onto a rotatable 3D grid, with height encoding value. */
export function CalendarHeatmap3D(props: CalendarHeatmap3DProps) {
  const heatmapProps = useCalendarProps(props, resolveWeeks(props.weeks).max);
  return <Heatmap3D {...heatmapProps} />;
}

export default CalendarHeatmap;
