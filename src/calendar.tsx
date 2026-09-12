"use client";

import { useMemo, type ReactNode } from "react";

import { Heatmap } from "./heatmap.js";
import { Heatmap3D } from "./heatmap3d.js";
import type { Heatmap3DProps, HeatmapCell, HeatmapProps, ResolvedCell } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
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

type CalendarOptions = {
  values?: ReadonlyArray<CalendarDay>;
  /** Last day shown. Defaults to today. */
  to?: string | Date;
  /** Columns to render. Defaults to 53. */
  weeks?: number;
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

/**
 * Lays days onto the grid: one column per week, one row per weekday. This is
 * the only place in the package that knows what a date is.
 */
function useCalendarProps<Props extends CalendarOptions & Pick<HeatmapProps, "cellSize" | "gap">>({
  values = [],
  to,
  weeks = 53,
  weekStart = 0,
  showMonthLabels = true,
  showWeekdayLabels = false,
  weekdayLabelRows = [1, 3, 5],
  unitLabel = "",
  tooltip,
  cellLabel,
  ...heatmapProps
}: Props) {
  const end = useMemo(() => toUtcMidnight(to ?? new Date()), [to]);

  const { cells, columnLabels, dates, hidden } = useMemo(() => {
    const byDate = new Map(values.map((day) => [day.date, day]));

    // The grid ends on the week containing `end`, so the last column is
    // partial whenever today is not the last day of the week.
    const endWeekday = (end.getUTCDay() - weekStart + 7) % 7;
    const lastColumnStart = new Date(end.getTime() - endWeekday * DAY_MS);
    const firstColumnStart = new Date(lastColumnStart.getTime() - (weeks - 1) * 7 * DAY_MS);

    const resolved: HeatmapCell[] = [];
    const dateByKey = new Map<string, string>();
    const hiddenSlots = new Set<string>();
    const labels: Array<{ column: number; text: string }> = [];
    let previousMonth = -1;

    for (let column = 0; column < weeks; column += 1) {
      // Which month a column belongs to is a property of the calendar, not of
      // the data, so the label is derived from the date before any value is
      // looked up. Deriving it inside the cell loop lost the label whenever
      // the caller had supplied nothing for that column's first day.
      const columnMonth = new Date(
        firstColumnStart.getTime() + column * 7 * DAY_MS,
      ).getUTCMonth();
      if (columnMonth !== previousMonth) {
        labels.push({ column, text: MONTHS[columnMonth] });
        previousMonth = columnMonth;
      }

      for (let row = 0; row < 7; row += 1) {
        const date = new Date(firstColumnStart.getTime() + (column * 7 + row) * DAY_MS);
        // Days after `end` are not "no data", they simply do not exist yet.
        if (date.getTime() > end.getTime()) {
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

    return { cells: resolved, columnLabels: labels, dates: dateByKey, hidden: hiddenSlots };
  }, [values, end, weeks, weekStart]);

  // A three-letter month is about 24px at the label's 10px font. When a month
  // starts too few columns after the previous label there is no room for both,
  // so the later one is dropped rather than drawn on top of its neighbour.
  const monthLabels = useMemo(() => {
    const stride = (heatmapProps.cellSize ?? 13) + (heatmapProps.gap ?? 3);
    const minColumns = Math.ceil(30 / stride);
    const kept: Array<{ column: number; text: string }> = [];
    let lastColumn = Number.NEGATIVE_INFINITY;
    for (const label of columnLabels) {
      if (label.column - lastColumn < minColumns) continue;
      kept.push(label);
      lastColumn = label.column;
    }
    return kept;
  }, [columnLabels, heatmapProps.cellSize, heatmapProps.gap]);

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
    columns: weeks,
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

/** Lays days onto a flat grid, with one column per week. */
export function CalendarHeatmap(props: CalendarHeatmapProps) {
  const heatmapProps = useCalendarProps(props);
  return <Heatmap {...heatmapProps} />;
}

/** Lays the same calendar onto a rotatable 3D grid, with height encoding value. */
export function CalendarHeatmap3D(props: CalendarHeatmap3DProps) {
  const heatmapProps = useCalendarProps(props);
  return <Heatmap3D {...heatmapProps} />;
}

export default CalendarHeatmap;
