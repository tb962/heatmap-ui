import assert from "node:assert/strict";
import test from "node:test";

import {
  levelForValue,
  linearThresholds,
  logThresholds,
  quantileThresholds,
} from "../dist/scale.js";

test("quantile bands stay populated on heavy-tailed data", () => {
  const values = [];
  for (let index = 0; index < 40; index += 1) values.push(1_000_000 + index * 50_000);
  values.push(360_000_000, 300_000_000, 250_000_000);

  const quantile = quantileThresholds(values);
  const linear = linearThresholds(values);
  const countBands = (thresholds) => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    values.forEach((value) => (counts[levelForValue(value, thresholds, 4)] += 1));
    return counts;
  };

  // Scaling against the maximum flattens nearly everything into one band.
  assert.ok(countBands(linear)[1] > values.length * 0.9);
  const spread = countBands(quantile);
  [1, 2, 3, 4].forEach((band) => assert.ok(spread[band] > 0, "band " + band + " empty"));
});

test("a repeated value never creates an unreachable band", () => {
  assert.deepEqual(quantileThresholds([7, 7, 7, 7]), [7]);
  assert.equal(levelForValue(7, [7], 4), 4);
});

test("zero and absent inputs sit below the first band", () => {
  assert.equal(levelForValue(0, quantileThresholds([5, 9]), 4), 0);
  assert.equal(levelForValue(3, [], 4), 0);
  assert.deepEqual(quantileThresholds([]), []);
  assert.deepEqual(quantileThresholds([0, 0]), []);
  assert.deepEqual(linearThresholds([0, 0]), []);
  assert.deepEqual(logThresholds([]), []);
});

test("the maximum always reaches the top band", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 900];
  for (const thresholds of [quantileThresholds(values), linearThresholds(values), logThresholds(values)]) {
    assert.equal(levelForValue(900, thresholds, 4), 4, JSON.stringify(thresholds));
    // Values beyond the recorded maximum clamp rather than overflow.
    assert.equal(levelForValue(5000, thresholds, 4), 4);
  }
});

test("log bands separate values spanning orders of magnitude", () => {
  const thresholds = logThresholds([1, 10, 100, 1000, 10000]);
  const levels = [1, 10, 100, 1000, 10000].map((v) => levelForValue(v, thresholds, 4));
  assert.deepEqual([...new Set(levels)].length > 2, true, "log collapsed the range");
});

test("levels other than four are honoured", () => {
  const thresholds = quantileThresholds([1, 2, 3, 4, 5, 6], 6);
  assert.equal(levelForValue(6, thresholds, 6), 6);
  assert.ok(levelForValue(1, thresholds, 6) >= 1);
});
