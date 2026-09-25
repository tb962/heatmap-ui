import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarHeatmap, CalendarHeatmap3D, Heatmap } from "../dist/index.js";
import { resolveWeeks } from "../dist/calendar.js";
import { fittingColumns } from "../dist/heatmap.js";

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const slotCount = (html) => (html.match(/heatmap__cell-slot/g) || []).length;
// 2026-09-07 is a Monday, so five days of the final week are not drawn.
const calendarSlots = (weeks) => weeks * 7 - 5;
const months = (html) =>
  [...html.matchAll(/heatmap__column-label"[^>]*>([A-Z][a-z]{2})</g)].map((m) => m[1]);

test("a fixed week count is exact and never fits", () => {
  assert.deepEqual(resolveWeeks(20), { min: 20, max: 20, fit: false });
  assert.deepEqual(resolveWeeks(undefined), { min: 53, max: 53, fit: false });
});

test("auto fits between one week and a year", () => {
  assert.deepEqual(resolveWeeks("auto"), { min: 1, max: 53, fit: true });
  assert.deepEqual(resolveWeeks({}), { min: 1, max: 53, fit: true });
  assert.deepEqual(resolveWeeks({ min: 13 }), { min: 13, max: 53, fit: true });
  assert.deepEqual(resolveWeeks({ max: 104 }), { min: 1, max: 104, fit: true });
});

test("week counts are whole, positive and finite", () => {
  assert.equal(resolveWeeks(0).max, 1);
  assert.equal(resolveWeeks(-4).max, 1);
  assert.equal(resolveWeeks(12.9).max, 12);
  // An unbounded count would never finish laying out the grid.
  assert.equal(resolveWeeks(Infinity).max, 53);
  assert.equal(resolveWeeks(Number.NaN).max, 53);
  assert.equal(resolveWeeks(null).max, 53);
  assert.deepEqual(resolveWeeks({ min: 0.5, max: Number.NaN }), { min: 1, max: 53, fit: true });
});

test("a minimum above the maximum wins", () => {
  assert.deepEqual(resolveWeeks({ min: 30, max: 10 }), { min: 30, max: 30, fit: true });
});

test("fitting counts whole columns, gap included only between them", () => {
  // 13px cells, 3px gaps: n columns span 16n - 3px.
  assert.equal(fittingColumns(16 * 10 - 3, 16, 3), 10);
  assert.equal(fittingColumns(16 * 10 - 4, 16, 3), 9);
  assert.equal(fittingColumns(16 * 10 + 12, 16, 3), 10);
  // A hexagon grid is half a column wider for its offset rows.
  assert.equal(fittingColumns(16 * 10 - 3, 16, 3, 8), 9);
  assert.equal(fittingColumns(0, 16, 3), 0);
  assert.equal(fittingColumns(5, 16, 3), 0);
  assert.equal(fittingColumns(100, 0, 3), 0);
});

test("before measuring, a fitted calendar renders its maximum", () => {
  const to = "2026-09-07";
  assert.equal(slotCount(render(CalendarHeatmap, { to, weeks: "auto" })), calendarSlots(53));
  assert.equal(slotCount(render(CalendarHeatmap, { to, weeks: { min: 4, max: 20 } })), calendarSlots(20));
});

test("a fitted calendar spans its container; a fixed one wraps its content", () => {
  assert.match(render(CalendarHeatmap, { weeks: "auto" }), /class="heatmap"[^>]*data-fit="true"/);
  assert.doesNotMatch(render(CalendarHeatmap, { weeks: 20 }), /data-fit/);
  assert.doesNotMatch(render(Heatmap, { rows: 1, columns: 1 }), /data-fit/);
});

test("3D calendars show the maximum rather than fit", () => {
  const to = "2026-09-07";
  const cellsOf = (weeks) => {
    const dates = new Set();
    render(CalendarHeatmap3D, { to, weeks, values: [], cellLabel: (cell) => (dates.add(cell.date), cell.date) });
    return dates.size;
  };
  assert.equal(cellsOf("auto"), cellsOf(53));
  assert.equal(cellsOf({ min: 4, max: 12 }), cellsOf(12));
});

test("overflow defaults to scroll, clipped until measured", () => {
  const html = render(Heatmap, { rows: 1, columns: 2, values: [[1, 2]] });
  assert.match(html, /class="heatmap"[^>]*data-overflow="scroll"/);
  assert.match(html, /heatmap__viewport"[^>]*data-scrolling="true"/);
  // The server cannot know the grid overflows, so it does not claim a tab stop.
  assert.doesNotMatch(html, /tabindex/i);
});

test("overflow visible never clips", () => {
  const html = render(Heatmap, { rows: 1, columns: 2, overflow: "visible", values: [[1, 2]] });
  assert.match(html, /data-overflow="visible"/);
  assert.doesNotMatch(html, /data-scrolling/);
});

test("calendars open on their newest week; plain grids on their first column", () => {
  assert.match(render(CalendarHeatmap, { weeks: 4 }), /heatmap__viewport" data-anchor="end"/);
  assert.match(render(Heatmap, { rows: 1, columns: 1 }), /heatmap__viewport" data-anchor="start"/);
});

test("row labels and the legend stay outside the scrolling viewport", () => {
  const html = render(CalendarHeatmap, {
    to: "2026-09-07", weeks: 10, showWeekdayLabels: true, showLegend: true,
  });
  const viewport = html.indexOf("heatmap__viewport");
  assert.ok(html.indexOf("heatmap__row-labels") < viewport, "row labels are inside the viewport");
  assert.ok(html.indexOf("heatmap__legend") > html.lastIndexOf("heatmap__cell-slot"));
  // Column labels scroll with the cells they name.
  assert.ok(html.indexOf("heatmap__column-labels") > viewport);
  // Row labels drop by the column label band so each lines up with its row.
  assert.match(html, /heatmap__row-labels" style="[^"]*margin-top:16px/);
  const unlabelled = render(CalendarHeatmap, { to: "2026-09-07", weeks: 10, showWeekdayLabels: true, showMonthLabels: false });
  assert.match(unlabelled, /heatmap__row-labels" style="[^"]*margin-top:0/);
});

test("a range starting in a month's last days labels the next month instead", () => {
  // 20 weeks to 2026-09-07 starts on 2026-04-26: one column of April.
  const html = render(CalendarHeatmap, { to: "2026-09-07", weeks: 20, cellSize: 13 });
  assert.deepEqual(months(html), ["May", "Jun", "Jul", "Aug", "Sep"]);
});
