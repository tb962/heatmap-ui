"use client";

import { useMemo, type ReactNode } from "react";

import { Heatmap } from "./heatmap.js";
import type { HeatmapCell, HeatmapProps, ResolvedCell } from "./types.js";

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

export type CalendarHeatmapProps = Omit<
  HeatmapProps,
  "rows" | "columns" | "values" | "rowLabels" | "columnLabels" | "tooltip" | "cellLabel"
> & {
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
export function CalendarHeatmap({
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
}: CalendarHeatmapProps) {
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

        if (row === 0) {
          const month = date.getUTCMonth();
          if (month !== previousMonth) {
            labels.push({ column, text: MONTHS[month] });
            previousMonth = month;
          }
        }
      }
    }

    return { cells: resolved, columnLabels: labels, dates: dateByKey, hidden: hiddenSlots };
  }, [values, end, weeks, weekStart]);

  const withDate = (cell: ResolvedCell): CalendarCell => ({
    ...cell,
    date: dates.get(cell.row + ":" + cell.column) ?? "",
  });

  const rowLabels = showWeekdayLabels
    ? Array.from({ length: 7 }, (_, row) =>
        weekdayLabelRows.includes(row) ? WEEKDAYS[(row + weekStart) % 7] : "",
      )
    : undefined;

  return (
    <Heatmap
      rows={7}
      columns={weeks}
      values={cells}
      isSlotHidden={(row, column) => hidden.has(row + ":" + column)}
      rowLabels={rowLabels}
      columnLabels={showMonthLabels ? columnLabels : undefined}
      tooltip={tooltip ? (cell) => tooltip(withDate(cell)) : undefined}
      cellLabel={(cell) => {
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
      }}
      {...heatmapProps}
    />
  );
}

export default CalendarHeatmap;
