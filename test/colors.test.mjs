import assert from "node:assert/strict";
import test from "node:test";

import { deriveRamp, luminance, parseHex } from "../dist/colors.js";

test("a ramp runs pale to strong and honours the level count", () => {
  const ramp = deriveRamp("#2563eb");
  assert.equal(ramp.length, 4);
  ramp.forEach((color) => assert.match(color, /^#[0-9a-f]{6}$/));
  // Palest first: luminance should fall across the ramp on a light ground.
  for (let index = 1; index < ramp.length; index += 1) {
    assert.ok(luminance(ramp[index]) < luminance(ramp[index - 1]), "ramp not monotonic");
  }
  assert.equal(deriveRamp("#2563eb", { levels: 6 }).length, 6);
});

test("a dark ground fades toward the dark, not toward white", () => {
  const onLight = deriveRamp("#2563eb", { ground: "#ffffff" });
  const onDark = deriveRamp("#2563eb", { ground: "#171614" });
  // The palest band is the one that has to track the surface behind it.
  assert.ok(luminance(onDark[0]) < luminance(onLight[0]), "dark ramp washed out");
});

test("shorthand hex and a leading hash are both accepted", () => {
  assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex("000000"), { r: 0, g: 0, b: 0 });
});

test("an unparseable colour degrades instead of throwing", () => {
  assert.deepEqual(deriveRamp("not-a-colour"), ["not-a-colour"]);
  assert.equal(parseHex("nope"), null);
});
