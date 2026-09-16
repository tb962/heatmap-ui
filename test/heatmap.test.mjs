import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarHeatmap, Heatmap } from "../dist/index.js";

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const slots = (html) => [...html.matchAll(/class="heatmap__cell-slot" style="([^"]*)"/g)].map((m) => m[1]);
const cells = (html) => [...html.matchAll(/class="heatmap__cell" style="([^"]*)"/g)].map((m) => m[1]);

test("cellSize still draws square cells", () => {
  const html = render(Heatmap, { rows: 1, columns: 2, cellSize: 10, gap: 2, values: [[1, 2]] });
  assert.match(slots(html)[1], /left:12px;top:0;width:10px;height:10px/);
  assert.match(html, /heatmap__grid" style="width:22px;height:10px"/);
});

test("cellWidth and cellHeight size each axis independently", () => {
  const html = render(Heatmap, {
    rows: 2, columns: 3, cellSize: 13, cellWidth: 5, cellHeight: 16, gap: 2,
    values: [[1, 2, 3], [4, 5, 6]],
  });
  assert.match(slots(html)[4], /left:7px;top:18px;width:5px;height:16px/);
  // 3 columns of 5 with 2 gaps; 2 rows of 16 with 1 gap.
  assert.match(html, /heatmap__grid" style="width:19px;height:34px"/);
  assert.match(cells(html)[0], /width:5px;height:16px/);
});

test("a thin rounded cell takes its radius from the shorter side", () => {
  const html = render(Heatmap, { rows: 1, columns: 1, cellWidth: 10, cellHeight: 30, values: [[1]] });
  assert.match(cells(html)[0], /border-radius:2px/);
});

test("circles stay round in a non-square slot", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 1, shape: "circle", cellWidth: 20, cellHeight: 10, values: [[1]],
  });
  assert.match(cells(html)[0], /width:10px;height:10px/);
});

test("bar grows along the cell height", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 1, shape: "bar", cellWidth: 4, cellHeight: 20, levels: 4, values: [[1]],
  });
  assert.match(cells(html)[0], /width:4px;height:20px/);
});

test("cellColor overrides the ramp and falls back when undefined", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 3, colors: ["#aaaaaa", "#bbbbbb"], emptyColor: "#eeeeee",
    values: [[0, 50, 100]],
    cellColor: (cell) => (cell.value === 0 ? "#ff0000" : cell.value === 100 ? undefined : "#00ff00"),
  });
  const [outage, degraded, fine] = cells(html);
  assert.match(outage, /background:#ff0000/);
  assert.match(degraded, /background:#00ff00/);
  assert.match(fine, /background:#bbbbbb/);
});

test("the calendar spaces month labels by cellWidth", () => {
  const values = [{ date: "2026-09-07", value: 1 }];
  const wide = render(CalendarHeatmap, { to: "2026-09-07", weeks: 20, values, cellWidth: 30 });
  const narrow = render(CalendarHeatmap, { to: "2026-09-07", weeks: 20, values, cellWidth: 3, gap: 1 });
  const count = (html) => (html.match(/heatmap__column-label"/g) || []).length;
  assert.ok(count(wide) > count(narrow));
});
