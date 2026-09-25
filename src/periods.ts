/**
 * The periods a calendar can be switched between: a rolling window ending
 * today, then each calendar year with data, newest first. This is only the
 * date arithmetic; the picker belongs to the app, in its own components.
 */

/** Spread into a calendar: `<CalendarHeatmap {...period.range} />`. */
export type CalendarRange = {
  /** Absent for the rolling window, whose length is the calendar's `weeks`. */
  from?: string;
  to: string;
};

export type CalendarPeriod = {
  /** Stable and unique: "rolling", or the year as a string. */
  key: string;
  /** A default, English label. Relabel from `kind` and `year` as needed. */
  label: string;
  kind: "rolling" | "year";
  /** Set for a year period. */
  year?: number;
  range: CalendarRange;
};

export type CalendarPeriodsOptions = {
  /** The day the periods are measured from. Defaults to today. */
  today?: string | Date;
  /** Leads with a window ending today. Defaults to true. */
  rolling?: boolean;
  /** Defaults to "Last 12 months". */
  rollingLabel?: string;
};

/**
 * Years come from the source: explicit years are used as given, while days
 * are read for the first year with data, which runs up to the current year so
 * a quiet year in between still has a period. Years after today are left out
 * of the derived list, since their days are not in any range yet.
 */
export function calendarPeriods(
  source: ReadonlyArray<{ date: string }> | ReadonlyArray<number> = [],
  { today, rolling = true, rollingLabel = "Last 12 months" }: CalendarPeriodsOptions = {},
): CalendarPeriod[] {
  const todayKey = isoDay(today ?? new Date()) ?? isoDay(new Date())!;
  const currentYear = Number(todayKey.slice(0, 4));

  const periods: CalendarPeriod[] = rolling
    ? [{ key: "rolling", label: rollingLabel, kind: "rolling", range: { to: todayKey } }]
    : [];

  for (const year of yearsOf(source, currentYear)) {
    periods.push({
      key: String(year),
      label: String(year),
      kind: "year",
      year,
      range: {
        from: pad(year) + "-01-01",
        // The current year runs to today: the rest of it has not happened.
        to: year === currentYear ? todayKey : pad(year) + "-12-31",
      },
    });
  }
  return periods;
}

function yearsOf(
  source: ReadonlyArray<{ date: string }> | ReadonlyArray<number>,
  currentYear: number,
): number[] {
  if (source.length > 0 && typeof source[0] === "number") {
    const years = (source as ReadonlyArray<number>).filter(
      (year) => Number.isInteger(year) && year > 0,
    );
    return [...new Set(years)].sort((a, b) => b - a);
  }

  let first = currentYear;
  for (const day of source as ReadonlyArray<{ date: string }>) {
    const year = Number(String(day?.date).slice(0, 4));
    if (Number.isInteger(year) && year > 0 && year < first) first = year;
  }
  return Array.from({ length: currentYear - first + 1 }, (_, index) => currentYear - index);
}

function isoDay(value: string | Date): string | null {
  const date = typeof value === "string" ? new Date(value.slice(0, 10) + "T00:00:00Z") : value;
  if (Number.isNaN(date.getTime())) return null;
  // A Date is read in UTC, as the calendar reads it.
  return date.toISOString().slice(0, 10);
}

function pad(year: number): string {
  return String(year).padStart(4, "0");
}
