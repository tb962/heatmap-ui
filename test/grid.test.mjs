import assert from "node:assert/strict";
import test from "node:test";

import { buildCells, normalizeValues } from "../dist/grid.js";

test("a dense matrix and a sparse list describe the same grid", () => {
  const matrix = normalizeValues([[1, 2], [3, 4]]);
  assert.equal(matrix.size, 4);
  assert.equal(matrix.get("1:0").value, 3);

  const sparse = normalizeValues([
    { row: 0, column: 0, value: 1 },
    { row: 1, column: 1, value: 4 },
  ]);
  assert.equal(sparse.size, 2);
  assert.equal(sparse.get("1:1").value, 4);
});

test("null in a matrix means no data, zero means measured and empty", () => {
  const cells = normalizeValues([[0, null]]);
  assert.equal(cells.get("0:0").value, 0);
  assert.equal(cells.get("0:0").known, true);
  assert.equal(cells.has("0:1"), false, "null was stored as a known value");
});

test("unknown slots are counted and never shaded", () => {
  const { cells, unknownCount, total } = buildCells({
    rows: 1,
    columns: 3,
    values: [
      { row: 0, column: 0, value: 10 },
      { row: 0, column: 1, value: 0 },
      // column 2 is absent entirely
    ],
    scale: "quantile",
    levels: 4,
  });

  assert.equal(cells.length, 3);
  assert.equal(unknownCount, 1);
  assert.equal(total, 10);
  assert.equal(cells[1].known, true);
  assert.equal(cells[1].level, 0, "a measured zero should not be shaded");
  assert.equal(cells[2].known, false);
  assert.equal(cells[2].level, 0);
});

test("an explicitly known:false cell is not treated as a value", () => {
  const { cells, unknownCount } = buildCells({
    rows: 1,
    columns: 1,
    values: [{ row: 0, column: 0, value: 99, known: false }],
    scale: "quantile",
    levels: 4,
  });
  assert.equal(unknownCount, 1);
  assert.equal(cells[0].value, 0, "an unknown slot leaked its value");
  assert.equal(cells[0].level, 0);
});

test("explicit thresholds bypass the scale entirely", () => {
  const { cells, thresholds } = buildCells({
    rows: 1,
    columns: 3,
    values: [[1, 50, 100]],
    scale: "quantile",
    levels: 4,
    thresholds: [10, 60, 90, 100],
  });
  assert.deepEqual(thresholds, [10, 60, 90, 100]);
  assert.equal(cells[0].level, 1);
  assert.equal(cells[1].level, 2);
  assert.equal(cells[2].level, 4);
});

test("meta rides through to the resolved cell", () => {
  const { cells } = buildCells({
    rows: 1,
    columns: 1,
    values: [{ row: 0, column: 0, value: 1, meta: { id: "x" } }],
    scale: "quantile",
    levels: 4,
  });
  assert.deepEqual(cells[0].meta, { id: "x" });
});

test("out-of-range and malformed cells are ignored, not thrown on", () => {
  const cells = normalizeValues([
    { row: 0, column: 0, value: 5 },
    { row: 1.5, column: 0, value: 9 },
    { row: 0, column: NaN, value: 9 },
    null,
  ]);
  assert.equal(cells.size, 1);
});
