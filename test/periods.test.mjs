import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarHeatmap, CalendarHeatmap3D, calendarPeriods } from "../dist/index.js";

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const slotCount = (html) => (html.match(/heatmap__cell-slot/g) || []).length;
const labels = (html) => [...html.matchAll(/heatmap__column-label"[^>]*>([^<]+)</g)].map((m) => m[1]);
const columns = (html) => Number(html.match(/Heatmap, 7 by (\d+)/)[1]);

test("from and to draw exactly the days between them", () => {
  // 2025 runs Wednesday to Wednesday: 365 days over 53 week columns.
  const html = render(CalendarHeatmap, { from: "2025-01-01", to: "2025-12-31" });
  assert.equal(slotCount(html), 365);
  assert.equal(columns(html), 53);
  assert.equal(slotCount(render(CalendarHeatmap, { from: "2025-01-01", to: "2025-12-31", weekStart: 1 })), 365);
});

test("from overrides weeks and is never trimmed to fit", () => {
  const html = render(CalendarHeatmap, { from: "2026-08-01", to: "2026-09-07", weeks: { min: 20, max: 30 } });
  assert.equal(slotCount(html), 38);
  assert.doesNotMatch(html, /data-fit/);
});

test("a from after to shows to alone", () => {
  assert.equal(slotCount(render(CalendarHeatmap, { from: "2026-10-01", to: "2026-09-07" })), 1);
});

test("an unreadable from is ignored rather than thrown", () => {
  const html = render(CalendarHeatmap, { from: "not a date", to: "2026-09-07", weeks: 2 });
  assert.equal(slotCount(html), 2 * 7 - 5);
});

test("a range from 1 January is labelled January, not the December its week starts in", () => {
  const html = render(CalendarHeatmap, { from: "2025-01-01", to: "2025-12-31" });
  assert.equal(labels(html)[0], "Jan");
});

test("a range over a year names each January by its year", () => {
  const long = labels(render(CalendarHeatmap, { to: "2026-09-07", weeks: 104 }));
  assert.ok(long.includes("2025") && long.includes("2026"), long.join(" "));
  assert.ok(!long.includes("Jan"));

  const year = labels(render(CalendarHeatmap, { to: "2026-09-07", weeks: 53 }));
  assert.ok(year.includes("Jan"));
  assert.ok(!year.includes("2026"));
});

test("3D calendars accept the same range", () => {
  const dates = new Set();
  render(CalendarHeatmap3D, {
    from: "2025-01-01", to: "2025-12-31", values: [],
    cellLabel: (cell) => (dates.add(cell.date), cell.date),
  });
  assert.equal(dates.size, 365);
  assert.ok(!dates.has("2024-12-31") && !dates.has("2026-01-01"));
});

test("periods lead with a rolling window, then each year back to the first with data", () => {
  const periods = calendarPeriods(
    [{ date: "2024-03-02", value: 1 }, { date: "2026-01-01", value: 1 }],
    { today: "2026-09-07" },
  );
  assert.deepEqual(periods.map((p) => p.key), ["rolling", "2026", "2025", "2024"]);
  assert.deepEqual(periods[0].range, { to: "2026-09-07" });
  // The current year stops at today; past years run to 31 December.
  assert.deepEqual(periods[1].range, { from: "2026-01-01", to: "2026-09-07" });
  assert.deepEqual(periods[2].range, { from: "2025-01-01", to: "2025-12-31" });
  assert.equal(periods[3].year, 2024);
});

test("a quiet year between busy ones still gets a period", () => {
  const periods = calendarPeriods([{ date: "2023-06-01" }], { today: "2026-09-07", rolling: false });
  assert.deepEqual(periods.map((p) => p.year), [2026, 2025, 2024, 2023]);
});

test("days in future years and unreadable dates add no periods", () => {
  const periods = calendarPeriods(
    [{ date: "2031-01-01" }, { date: "garbage" }, { date: "2026-02-01" }],
    { today: "2026-09-07" },
  );
  assert.deepEqual(periods.map((p) => p.key), ["rolling", "2026"]);
});

test("explicit years are used as given, deduplicated and newest first", () => {
  const periods = calendarPeriods([2023, 2025, 2025, 1.5, -1], { today: "2026-09-07", rolling: false });
  assert.deepEqual(periods.map((p) => p.year), [2025, 2023]);
});

test("no data still offers this year", () => {
  assert.deepEqual(calendarPeriods([], { today: "2026-09-07" }).map((p) => p.key), ["rolling", "2026"]);
  assert.deepEqual(calendarPeriods(undefined, { today: "2026-09-07", rollingLabel: "This year so far" })[0].label, "This year so far");
});

test("a period's range drives the calendar directly", () => {
  const [, , lastYear] = calendarPeriods([{ date: "2025-05-05" }], { today: "2026-09-07" });
  assert.equal(slotCount(render(CalendarHeatmap, lastYear.range)), 365);
});
