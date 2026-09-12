import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarHeatmap, CalendarHeatmap3D } from "../dist/index.js";

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("3D calendars preserve the 2D date grid, metadata and missing days", () => {
  for (const weekStart of [0, 1]) {
    const props = {
      to: new Date("2026-09-07T23:45:00Z"),
      weeks: 2,
      weekStart,
      values: [
        { date: "2026-08-31", value: 3, meta: { source: "sample" } },
        { date: "2026-09-06", value: 0 },
        { date: "2026-09-07", value: 8, known: false },
        { date: "2026-09-08", value: 100 },
      ],
    };
    const readCells = (component) => {
      const byDate = new Map();
      render(component, {
        ...props,
        cellLabel: (cell) => {
          byDate.set(cell.date, cell);
          return cell.date;
        },
      });
      return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    };

    const flat = readCells(CalendarHeatmap);
    const spatial = readCells(CalendarHeatmap3D);
    assert.deepEqual(spatial, flat);
    assert.equal(spatial.length, weekStart === 0 ? 9 : 8);
    assert.equal(spatial.at(-1).date, "2026-09-07");
    assert.ok(spatial.every((cell) => cell.date <= "2026-09-07"));
    assert.deepEqual(spatial.find((cell) => cell.date === "2026-08-31").meta, {
      source: "sample",
    });
  }
});

test("3D calendar labels distinguish a known zero from an unobserved day", () => {
  const html = render(CalendarHeatmap3D, {
    to: "2026-09-07",
    weeks: 1,
    unitLabel: "commits",
    values: [{ date: "2026-09-07", value: 0 }],
    blockStyle: "building",
  });
  assert.match(html, /aria-label="Monday, September 7, 2026\. 0 commits"/);
  assert.match(html, /aria-label="Sunday, September 6, 2026\. No data\."/);
  assert.doesNotMatch(html, /Tuesday, September 8, 2026/);
});
