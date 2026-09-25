/**
 * The playground's Code tab promises "every prop above is in effect". The code
 * is written by hand, separately from the chart it describes, so this test
 * holds the two together: for many settings it builds the preview element and
 * the snippet, evaluates the snippet's declarations and props, and requires
 * both sides to agree prop for prop.
 */
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { deriveRamp } from "../dist/index.js";

const PLAYGROUND = new URL("../examples/playground.html", import.meta.url);

async function loadPlayground() {
  const html = readFileSync(PLAYGROUND, "utf8");
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, "playground module script not found");
  const source = match[1]
    .replace('from "react"', `from ${JSON.stringify(import.meta.resolve("react"))}`)
    .replace('from "react-dom/client"', `from ${JSON.stringify(import.meta.resolve("react-dom/client"))}`)
    .replace('from "../dist/index.js"', `from ${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)}`)
    .replace(/^createRoot\(.*$/m, "")
    + "\nexport { buildChart, DEFAULTS, GRAPH_NAMES, Heatmap, Heatmap3D, CalendarHeatmap, CalendarHeatmap3D };\n";
  const dir = mkdtempSync(join(tmpdir(), "heatmap-playground-"));
  const file = join(dir, "playground.mjs");
  writeFileSync(file, source);
  try {
    return await import(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pg = await loadPlayground();

const GITHUB = ["#9be9a8", "#40c463", "#30a14e", "#216e39"];
const HEATMAP_DEFAULTS = {
  scale: "linear", shape: "rounded", encode: "color", cellSize: 13, gap: 3,
  colors: GITHUB, emptyColor: "#ebedf0", unknownOpacity: 0.5, minScale: 0.35, showLegend: false,
};
const CALENDAR_DEFAULTS = {
  weeks: 53, weekStart: 0, showMonthLabels: true, showWeekdayLabels: false, unitLabel: "",
};
const HEATMAP3D_DEFAULTS = {
  scale: "linear", shape: "rectangle", blockStyle: "solid", cellSize: 13, gap: 3,
  theme: "color", material: "solid", animation: "none", maxHeight: 100, showLegend: false,
  unknownOpacity: 0.5,
  // The default "color" theme supplies the GitHub ramp and its own empty colour.
  colors: GITHUB, emptyColor: "#e5e9e7",
};
const DEFAULTS_BY_TAG = {
  Heatmap: HEATMAP_DEFAULTS,
  CalendarHeatmap: { ...HEATMAP_DEFAULTS, ...CALENDAR_DEFAULTS },
  Heatmap3D: HEATMAP3D_DEFAULTS,
  CalendarHeatmap3D: { ...HEATMAP3D_DEFAULTS, ...CALENDAR_DEFAULTS },
};
const COMPONENTS = new Map([
  [pg.Heatmap, "Heatmap"], [pg.CalendarHeatmap, "CalendarHeatmap"],
  [pg.Heatmap3D, "Heatmap3D"], [pg.CalendarHeatmap3D, "CalendarHeatmap3D"],
]);
/** Playground wiring with no counterpart in copied code. */
const PLAYGROUND_ONLY = new Set(["onCameraChange", "children"]);

/** The chart is the component element itself, or nested in a wrapper (the status key). */
function findChart(element) {
  if (!element || typeof element !== "object") return null;
  if (COMPONENTS.has(element.type)) return element;
  const children = [].concat(element.props?.children ?? []);
  for (const child of children) {
    const found = findChart(child);
    if (found) return found;
  }
  return null;
}

/** Splits a snippet into its declarations and the component's attributes. */
function parseSnippet(code) {
  const lines = code.split("\n");
  const open = lines.findIndex((line) => /^<\w+$/.test(line));
  const close = lines.lastIndexOf("/>");
  assert.ok(open > 0 && close > open, "snippet has no <Component … /> block:\n" + code);
  const setup = lines.slice(0, open).filter((line) => !line.startsWith("import ")).join("\n");
  const tag = lines[open].slice(1);
  const body = lines.slice(open + 1, close).join("\n");

  const props = new Map();
  let i = 0;
  while (i < body.length) {
    const rest = body.slice(i);
    const comment = rest.match(/^\s*\/\/[^\n]*\n?/);
    if (comment) { i += comment[0].length; continue; }
    const ws = rest.match(/^\s+/);
    if (ws) { i += ws[0].length; continue; }
    const name = rest.match(/^[A-Za-z][\w-]*/);
    assert.ok(name, "unparseable attribute near: " + rest.slice(0, 40));
    i += name[0].length;
    if (body[i] !== "=") { props.set(name[0], { literal: true }); continue; }
    i += 1;
    if (body[i] === '"') {
      const end = body.indexOf('"', i + 1);
      props.set(name[0], { literal: body.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    assert.equal(body[i], "{", `attribute ${name[0]} has no value`);
    let depth = 0;
    let j = i;
    for (; j < body.length; j += 1) {
      if (body[j] === "{") depth += 1;
      else if (body[j] === "}" && --depth === 0) break;
    }
    props.set(name[0], { expr: body.slice(i + 1, j).trim() });
    i = j + 1;
  }
  return { tag, setup, props };
}

/** Runs the declarations the snippet asks a reader to paste, and returns them by name. */
function evaluateSetup(setup) {
  const names = [...setup.matchAll(/^const (\w+)/gm)].map((m) => m[1]);
  const run = new Function("deriveRamp", `${setup}\nreturn { ${names.join(", ")} };`);
  return run(deriveRamp);
}

const NOT_DECLARED = Symbol("reader's own data");
function evaluateExpr(expr, scope) {
  try {
    return new Function("deriveRamp", ...Object.keys(scope), `return (${expr});`)(
      deriveRamp, ...Object.values(scope));
  } catch (error) {
    // `values={uptime}` names the reader's data, which the snippet leaves undeclared.
    if (error instanceof ReferenceError) return NOT_DECLARED;
    throw error;
  }
}

const SAMPLE_CELLS = [];
for (const row of [0, 1, 3]) {
  for (const column of [0, 2, 5]) {
    for (const value of [0, 12, 50, 89.9, 90, 99, 99.95, 100]) {
      for (const known of [true, false]) {
        SAMPLE_CELLS.push({ row, column, value, known, level: 2, meta: undefined, date: "2026-09-07" });
      }
    }
  }
}

function sameBehaviour(name, shown, written, bounds) {
  assert.equal(typeof written, "function", `${name} is not a function in the code`);
  if (name === "isSlotHidden") {
    for (let row = 0; row < bounds.rows; row += 1) {
      for (let column = 0; column < bounds.columns; column += 1) {
        assert.equal(written(row, column), shown(row, column), `${name}(${row}, ${column})`);
      }
    }
    return;
  }
  // Labels index arrays sized to the grid, so only cells that exist are compared.
  for (const cell of SAMPLE_CELLS.filter((c) => c.row < bounds.rows && c.column < bounds.columns)) {
    assert.deepEqual(written({ ...cell }), shown({ ...cell }), `${name} for ${JSON.stringify(cell)}`);
  }
}

function check(settings, isDark) {
  const { code, chart } = pg.buildChart(settings, { isDark });
  const element = findChart(chart);
  assert.ok(element, "preview has no chart component");
  const shownTag = COMPONENTS.get(element.type);
  const { tag, setup, props } = parseSnippet(code);
  assert.equal(tag, shownTag, "component");

  const scope = evaluateSetup(setup);
  // A calendar is seven weekdays by its week count.
  const weeks = element.props.weeks;
  const bounds = {
    rows: element.props.rows ?? 7,
    columns: element.props.columns ?? (typeof weeks === "number" ? weeks : weeks?.max ?? 53),
  };
  const shown = Object.fromEntries(
    Object.entries(element.props).filter(([k, v]) => v !== undefined && !PLAYGROUND_ONLY.has(k)));

  for (const [name, written] of props) {
    assert.ok(name in shown, `code sets ${name}, preview does not`);
    if ("literal" in written) {
      assert.deepEqual(shown[name], written.literal, name);
      continue;
    }
    const value = evaluateExpr(written.expr, scope);
    if (value === NOT_DECLARED) continue;
    if (typeof shown[name] === "function") sameBehaviour(name, shown[name], value, bounds);
    else assert.deepEqual(value, shown[name], name);
  }

  const defaults = DEFAULTS_BY_TAG[shownTag];
  for (const [name, value] of Object.entries(shown)) {
    if (props.has(name)) continue;
    const fallback = name === "levels" ? (shown.colors ?? GITHUB).length : defaults[name];
    assert.deepEqual(value, fallback, `preview sets ${name}=${JSON.stringify(value)}, code omits it`);
  }
}

const VARIANTS = [
  {},
  { theme: "dark" }, { theme: "light" },
  { ramp: "ocean" }, { ramp: "custom", base: "#ff5500" }, { levels: 6 }, { levels: 3, ramp: "sunset" },
  { scale: "quantile" }, { cellSize: 20, gap: 1 }, { shape: "circle" }, { shape: "bar" },
  { encode: "size" }, { showValues: true }, { showLegend: false }, { empty: "#123456" },
  { theme3d: "night" }, { material: "pattern" }, { animation: "none" },
  { shape3d: "circle", blockStyle: "lego", maxHeight: 40 }, { yaw: 12, pitch: 20, zoom: 150 },
  { weeks: 10 }, { fitWeeks: true }, { fitWeeks: true, weeks: 20 }, { fitWeeks: true, minWeeks: 13 },
  { fitWeeks: true, minWeeks: 8, weeks: 30 }, { weekStart: "Monday" }, { showMonths: false }, { showWeekdays: true },
  { showHours: false }, { showDays: false },
  { cohorts: 5, horizon: 6 }, { items: 4, hideDiagonal: false }, { items: 12 },
  { services: 4, days: 60 },
  { colorBy: "scale" }, { colorBy: "scale", encode: "both", scale: "quantile" },
  { statusPalette: "quiet" }, { statusPalette: "safe" },
  { statusPalette: "custom", statusCustom: ["#ffffff", "#ffee00", "#ff8800", "#ff0000"] },
  { degradedBelow: 99.9, partialBelow: 95, outageBelow: 50 },
  { showServices: false }, { showDates: false }, { cellWidth: 8, cellHeight: 8, cellSize: 20 },
];

for (const graph of pg.GRAPH_NAMES) {
  for (const dimension of ["2d", "3d"]) {
    test(`Code tab matches the preview: ${graph} ${dimension}`, () => {
      for (const variant of VARIANTS) {
        for (const systemDark of [false, true]) {
          const settings = { ...pg.DEFAULTS, graph, dimension, ...variant };
          const isDark = settings.theme === "system" ? systemDark : settings.theme === "dark";
          try {
            check(settings, isDark);
          } catch (error) {
            throw new Error(`[${JSON.stringify(variant)}, ${isDark ? "dark" : "light"}] ${error.message}`, { cause: error });
          }
        }
      }
    });
  }
}
