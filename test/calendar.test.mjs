import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarHeatmap, Heatmap } from "../dist/index.js";

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("the calendar lays a week per column and a weekday per row", () => {
  const html = render(CalendarHeatmap, {
    to: "2026-09-07",
    weeks: 4,
    values: [{ date: "2026-09-07", value: 5 }],
  });
  // 4 columns of 7, minus the days after 2026-09-07 (a Monday) in the last week.
  const slots = (html.match(/heatmap__cell-slot/g) || []).length;
  assert.equal(slots, 4 * 7 - 5);
});

test("days beyond the end date are not drawn at all", () => {
  // 2026-09-07 is a Monday, so Tue-Sat of that week do not exist yet.
  const html = render(CalendarHeatmap, { to: "2026-09-07", weeks: 2, values: [] });
  assert.equal((html.match(/heatmap__cell-slot/g) || []).length, 2 * 7 - 5);
  // Days that do exist but were not supplied are honestly reported as missing.
  assert.match(html, /No data\./);
});

test("a day carries an accessible date label", () => {
  const html = render(CalendarHeatmap, {
    to: "2026-09-07",
    weeks: 1,
    unitLabel: "commits",
    values: [{ date: "2026-09-07", value: 3 }],
  });
  assert.match(html, /Monday, September 7, 2026\. 3 commits/);
});

test("a day with no data says so rather than reading as zero", () => {
  const html = render(CalendarHeatmap, {
    to: "2026-09-07",
    weeks: 1,
    values: [{ date: "2026-09-07", value: 0, known: false }],
  });
  assert.match(html, /Monday, September 7, 2026\. No data\./);
});

test("a month is labelled from the calendar, not from the data it happens to have", () => {
  // 2026-09-07 is a Monday; 20 weeks back reaches late April. Supplying a
  // single day proves the labels do not depend on values being present.
  const sparse = render(CalendarHeatmap, {
    to: "2026-09-07",
    weeks: 20,
    cellSize: 30,
    values: [{ date: "2026-09-07", value: 1 }],
  });
  const months = [...sparse.matchAll(/heatmap__column-label"[^>]*>([A-Z][a-z]{2})</g)]
    .map((m) => m[1]);
  assert.deepEqual(months, ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);

  // The same range with every day supplied must label it identically.
  const dense = render(CalendarHeatmap, {
    to: "2026-09-07",
    weeks: 20,
    cellSize: 30,
    values: Array.from({ length: 140 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 7) - (139 - i) * 86400000)
        .toISOString()
        .slice(0, 10),
      value: i,
    })),
  });
  const denseMonths = [...dense.matchAll(/heatmap__column-label"[^>]*>([A-Z][a-z]{2})</g)]
    .map((m) => m[1]);
  assert.deepEqual(denseMonths, months);
});

test("month labels thin out when the columns are too narrow to hold them", () => {
  const props = { to: "2026-09-07", weeks: 20, values: [{ date: "2026-09-07", value: 1 }] };
  const count = (html) =>
    (html.match(/heatmap__column-label/g) || []).length;

  // April runs out one column into the range, so May cannot also be labelled
  // at a 13px cell — but there is room for it at 30px.
  assert.ok(count(render(CalendarHeatmap, { ...props, cellSize: 13 })) <
            count(render(CalendarHeatmap, { ...props, cellSize: 30 })));
});

test("weekStart shifts which weekday sits in the first row", () => {
  const sunday = render(CalendarHeatmap, {
    to: "2026-09-07", weeks: 2, weekStart: 0, showWeekdayLabels: true,
    weekdayLabelRows: [0],
  });
  const monday = render(CalendarHeatmap, {
    to: "2026-09-07", weeks: 2, weekStart: 1, showWeekdayLabels: true,
    weekdayLabelRows: [0],
  });
  assert.match(sunday, /Sun/);
  assert.match(monday, /Mon/);
});

test("the core renders any grid, not just seven rows", () => {
  const html = render(Heatmap, {
    rows: 24,
    columns: 7,
    values: [{ row: 23, column: 6, value: 1 }],
    ariaLabel: "Punchcard",
  });
  assert.equal((html.match(/heatmap__cell-slot/g) || []).length, 24 * 7);
  assert.match(html, /aria-label="Punchcard"/);
});

test("every shape renders without throwing", () => {
  for (const shape of ["rounded", "square", "circle", "diamond", "hexagon", "plus", "bar", "ring"]) {
    const html = render(Heatmap, {
      rows: 2, columns: 2, shape, values: [[1, 2], [3, 4]],
    });
    assert.ok(html.length > 0, shape + " rendered nothing");
  }
});

test("size encoding shrinks low cells and leaves high ones full", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 2, cellSize: 20, encode: "size", minScale: 0.4,
    values: [[1, 100]],
  });
  // The weakest cell shrinks toward minScale; the strongest fills its slot.
  assert.match(html, /width:20px/, "the top cell should fill its slot");
  const widths = [...html.matchAll(/width:(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...widths) < 20, "no cell was scaled down");
});

test("cells are only focusable when they carry information", () => {
  const bare = render(Heatmap, { rows: 1, columns: 1, values: [[1]] });
  assert.ok(!/tabindex/i.test(bare), "a bare cell should not take focus");

  const labelled = render(Heatmap, {
    rows: 1, columns: 1, values: [[1]], cellLabel: () => "one",
  });
  assert.match(labelled, /tabindex="0"/);
});

test("bar cells scale their height with the level", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 3, shape: "bar", cellSize: 20,
    values: [[1, 50, 100]],
  });
  // Scope to the cell, not the slot that wraps it — both carry a height.
  const heights = [...html.matchAll(/class="heatmap__cell"[^>]*height:(\d+)px/g)]
    .map((m) => Number(m[1]));
  assert.equal(heights.length, 3, "a bar cell rendered without a height");
  assert.ok(heights[0] < heights[2], "bar height did not track the value");
});

test("ring cells thicken with the level and stay unfilled", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 2, shape: "ring", cellSize: 20, values: [[1, 100]],
  });
  assert.match(html, /background:transparent/);
  const borders = [...html.matchAll(/border:(\d+)px solid/g)].map((m) => Number(m[1]));
  assert.ok(borders[0] < borders[1], "ring thickness did not track the value");
});
