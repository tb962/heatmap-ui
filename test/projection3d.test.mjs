import assert from "node:assert/strict";
import test from "node:test";

import { buildCells } from "../dist/grid.js";
import {
  normalizeCamera,
  projectPoint,
  projectionBounds,
  resolveHeightDomain,
  valueToHeight,
} from "../dist/projection3d.js";

const grid = (values, options = {}) => buildCells({
  rows: values.length,
  columns: values[0].length,
  values,
  scale: "quantile",
  levels: 4,
  ...options,
});

test("height preserves value ratios instead of converting color bands into steps", () => {
  const { cells } = grid([[1, 2, 3, 100]]);
  const domain = resolveHeightDomain(cells);
  assert.deepEqual(domain, [0, 100]);
  const heights = cells.map((cell) => valueToHeight(cell.value, domain, 200));
  assert.deepEqual(heights, [2, 4, 6, 200]);
  assert.equal(heights[2] / heights[0], cells[2].value / cells[0].value);
});

test("changing the color scale or thresholds cannot change geometric heights", () => {
  const values = [[1, 2, 3, 10, 100]];
  const options = [
    { scale: "quantile" },
    { scale: "linear" },
    { scale: "log" },
    { thresholds: [5, 20, 70, 100] },
  ];
  const geometries = options.map((option) => {
    const { cells } = grid(values, option);
    const domain = resolveHeightDomain(cells);
    return cells.map((cell) => valueToHeight(cell.value, domain, 100));
  });
  for (const heights of geometries) assert.deepEqual(heights, values[0]);
});

test("hidden and explicitly unknown highs do not flatten the visible data", () => {
  const { cells } = buildCells({
    rows: 1,
    columns: 5,
    values: [
      { row: 0, column: 0, value: 10 },
      { row: 0, column: 1, value: 0 },
      { row: 0, column: 2, value: 1000 },
      { row: 0, column: 3, value: 2000, known: false },
    ],
    scale: "quantile",
    levels: 4,
    isSlotHidden: (_row, column) => column === 2,
  });
  const domain = resolveHeightDomain(cells);
  assert.deepEqual(domain, [0, 10]);
  assert.equal(cells.some((cell) => cell.column === 2), false);
  assert.deepEqual(cells.map((cell) => valueToHeight(cell.value, domain, 100)), [100, 0, 0, 0]);
  assert.deepEqual(cells.map((cell) => cell.known), [true, true, false, false]);
  assert.deepEqual(resolveHeightDomain([
    { known: true, value: 10 },
    { known: false, value: 2000 },
  ]), [0, 10]);
});

test("empty, all-zero, negative and nonfinite datasets have a finite height domain", () => {
  for (const values of [[], [0, 0], [-10, -1], [NaN, Infinity, -Infinity]]) {
    const domain = resolveHeightDomain(values.map((value) => ({ known: true, value })));
    assert.deepEqual(domain, [0, 1]);
    for (const value of values) assert.equal(valueToHeight(value, domain, 100), 0);
  }
});

test("an explicit common domain allows different charts to share a truthful scale", () => {
  const low = grid([[5, 10]]).cells;
  const high = grid([[50, 100]]).cells;
  const domain = [0, 100];
  assert.deepEqual(resolveHeightDomain(low, domain), domain);
  assert.deepEqual(resolveHeightDomain(high, domain), domain);
  assert.equal(valueToHeight(low[1].value, domain, 200), 20);
  assert.equal(valueToHeight(high[1].value, domain, 200), 200);
  assert.equal(valueToHeight(200, domain, 200), 200, "outliers must not escape the chart bounds");
});

test("invalid explicit domains fall back to the observed finite maximum", () => {
  const cells = [{ known: true, value: 20 }];
  for (const domain of [[0, 0], [10, 5], [0, NaN], [0, Infinity], [-Infinity, 20]]) {
    assert.deepEqual(resolveHeightDomain(cells, domain), [0, 20]);
  }
});

test("camera controls keep extreme and malformed inputs in a finite usable range", () => {
  const normal = normalizeCamera({});
  for (const camera of [
    { yaw: NaN, pitch: NaN, zoom: NaN },
    { yaw: Infinity, pitch: Infinity, zoom: Infinity },
    { yaw: -Infinity, pitch: -Infinity, zoom: -Infinity },
    { yaw: 1e9, pitch: 1e9, zoom: 1e9 },
    { yaw: -1e9, pitch: -1e9, zoom: -1e9 },
  ]) {
    const result = normalizeCamera(camera);
    assert.ok(Number.isFinite(result.yaw) && result.yaw >= -180 && result.yaw < 180);
    assert.ok(Number.isFinite(result.pitch) && result.pitch >= 15 && result.pitch <= 75);
    assert.ok(Number.isFinite(result.zoom) && result.zoom >= 0.55 && result.zoom <= 2);
  }
  assert.deepEqual(normalizeCamera({ yaw: NaN, pitch: NaN, zoom: NaN }), normal);
  assert.deepEqual(normalizeCamera({ yaw: 325 }), normalizeCamera({ yaw: -35 }));
});

test("vertical columns stay vertical and positive heights project upward at every camera angle", () => {
  for (const yaw of [-180, -135, -90, -35, 0, 45, 90, 135, 179]) {
    for (const pitch of [15, 38, 75]) {
      const camera = normalizeCamera({ yaw, pitch, zoom: 1 });
      const base = projectPoint({ x: 20, y: -40, z: 0 }, camera);
      const middle = projectPoint({ x: 20, y: -40, z: 50 }, camera);
      const top = projectPoint({ x: 20, y: -40, z: 100 }, camera);
      for (const point of [base, middle, top]) {
        for (const axis of ["x", "y", "depth"]) assert.ok(Number.isFinite(point[axis]));
      }
      assert.equal(top.x, base.x);
      assert.ok(top.y < middle.y && middle.y < base.y);
      assert.ok(Math.abs((base.y - middle.y) - (middle.y - top.y)) < 1e-9);
    }
  }
});

test("projection bounds remain finite for empty, narrow and large grids", () => {
  for (const [width, depth, height] of [[0, 0, 0], [1, 1000, 120], [1000, 1, 120], [800, 800, 240]]) {
    const bounds = projectionBounds(width, depth, height);
    for (const coordinate of [bounds.x, bounds.y, bounds.width, bounds.height]) {
      assert.ok(Number.isFinite(coordinate));
    }
    assert.ok(bounds.width > 0 && bounds.height > 0);
  }
});

test("orbiting cannot clip any corner of the data volume at the default zoom", () => {
  for (const [width, depth, height] of [[1, 1000, 120], [1000, 1, 120], [800, 800, 240]]) {
    const bounds = projectionBounds(width, depth, height);
    for (let yaw = -180; yaw < 180; yaw += 15) {
      for (const pitch of [15, 38, 75]) {
        const camera = normalizeCamera({ yaw, pitch, zoom: 1 });
        for (const x of [-width / 2, width / 2]) {
          for (const y of [-depth / 2, depth / 2]) {
            for (const z of [0, height]) {
              const point = projectPoint({ x, y, z }, camera);
              assert.ok(point.x >= bounds.x && point.x <= bounds.x + bounds.width);
              assert.ok(point.y >= bounds.y && point.y <= bounds.y + bounds.height);
            }
          }
        }
      }
    }
  }
});

test("invalid height and layout options cannot introduce nonfinite coordinates", () => {
  assert.equal(valueToHeight(10, [0, 10], -50), 0);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(valueToHeight(10, [0, 10], invalid), 100);
    const bounds = projectionBounds(invalid, invalid, invalid);
    for (const value of Object.values(bounds)) assert.ok(Number.isFinite(value));
    assert.ok(bounds.width > 0 && bounds.height > 0);
  }
});
