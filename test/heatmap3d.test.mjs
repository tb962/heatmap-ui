import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Heatmap3D, renderHeatmap3DSvg } from "../dist/index.js";

const render = (props) => renderToStaticMarkup(React.createElement(Heatmap3D, props));

function renderedCells(html) {
  const starts = [...html.matchAll(/<g class="heatmap3d__cell"([^>]*)>/g)];
  return starts.map((match, index) => ({
    attributes: Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]])),
    html: html.slice(match.index, starts[index + 1]?.index ?? html.indexOf('<g class="heatmap3d__labels"')),
  }));
}

const byColumn = (cells) => [...cells].sort((a, b) => Number(a.attributes["data-column"]) - Number(b.attributes["data-column"]));
const paths = (html) => [...html.matchAll(/\sd="([^"]*)"/g)].map((match) => match[1]);

test("all three footprints and all three block styles render finite geometry", () => {
  for (const shape of ["rectangle", "circle", "bar"]) {
    for (const blockStyle of ["solid", "lego", "building"]) {
      const html = render({ rows: 2, columns: 3, values: [[0, 1, 10], [null, 50, 100]], shape, blockStyle });
      assert.equal(renderedCells(html).length, 6, `${shape}/${blockStyle}`);
      assert.doesNotMatch(html, /NaN|Infinity|undefined/);
      assert.match(html, new RegExp(`data-shape="${shape}"`));
      assert.match(html, new RegExp(`data-block-style="${blockStyle}"`));
    }
  }
});

test("renderer heights and actual mesh paths are independent of the shade strategy", () => {
  const props = { rows: 1, columns: 4, values: [[1, 2, 10, 100]], maxHeight: 100 };
  const variants = [
    { scale: "quantile" },
    { scale: "linear" },
    { scale: "log" },
    { thresholds: [1, 20, 80, 100] },
  ].map((options) => byColumn(renderedCells(render({ ...props, ...options }))));
  const geometry = variants[0].map((cell) => paths(cell.html));
  for (const cells of variants) {
    assert.deepEqual(cells.map((cell) => Number(cell.attributes["data-height"])), [1, 2, 10, 100]);
    assert.deepEqual(cells.map((cell) => paths(cell.html)), geometry);
  }
});

test("LEGO studs and building details keep the highest roof at the measured value", () => {
  const pitch = 45;
  for (const blockStyle of ["solid", "lego", "building"]) {
    const cells = byColumn(renderedCells(render({
      rows: 1, columns: 3, values: [[1, 10, 100]], cellSize: 20,
      maxHeight: 100, shape: "circle", blockStyle, yaw: 0, pitch,
    })));
    cells.forEach((cell, index) => {
      // At yaw=0 all cell centers have ground y=0. The centroid of a circular
      // horizontal cap therefore projects to y=-height*cos(pitch), regardless
      // of its radius. This checks real mesh geometry, including stud tops.
      const capHeights = paths(cell.html).flatMap((path) => {
        const points = [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
        if (points.length < 12) return [];
        const centerY = points.reduce((sum, point) => sum + Number(point[2]), 0) / points.length;
        return [-centerY / Math.cos(pitch * Math.PI / 180)];
      });
      const expected = [1, 10, 100][index];
      assert.ok(capHeights.length > 0);
      assert.ok(Math.abs(Math.max(...capHeights) - expected) < 0.002, `${blockStyle} changed value ${expected}`);
    });
  }
});

test("zero, missing and hidden cells stay distinct and cannot alter the height domain", () => {
  const html = render({
    rows: 1, columns: 5, blockStyle: "building", showLegend: true,
    values: [
      { row: 0, column: 0, value: 10 },
      { row: 0, column: 1, value: 0 },
      { row: 0, column: 2, value: 9999, known: false },
      { row: 0, column: 4, value: 99999 },
    ],
    isSlotHidden: (_row, column) => column === 4,
  });
  const cells = byColumn(renderedCells(html));
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map((cell) => cell.attributes["data-height"]), ["100", "0", "0", "0"]);
  assert.deepEqual(cells.map((cell) => cell.attributes["data-known"]), ["true", "true", "false", "false"]);
  assert.match(html, /data-total="10"/);
  assert.match(cells[1].html, /heatmap3d__surface/);
  assert.doesNotMatch(cells[1].html, /heatmap3d__unknown|heatmap3d__window/);
  for (const cell of cells.slice(2)) {
    assert.match(cell.html, /heatmap3d__unknown/);
    assert.match(cell.html, /fill="transparent"/);
    assert.doesNotMatch(cell.html, /heatmap3d__surface|heatmap3d__window|9999/);
    assert.match(cell.attributes["aria-label"], /no data/i);
  }
});

test("the painter order follows ground depth as the camera turns, regardless of tower height", () => {
  const props = { rows: 2, columns: 2, values: [[100, 1], [2, 3]] };
  const rowsAt = (yaw) => renderedCells(render({ ...props, yaw })).map((cell) => Number(cell.attributes["data-row"]));
  const columnsAt = (yaw) => renderedCells(render({ ...props, yaw })).map((cell) => Number(cell.attributes["data-column"]));
  assert.deepEqual(rowsAt(0), [0, 0, 1, 1]);
  assert.deepEqual(rowsAt(180), [1, 1, 0, 0]);
  assert.deepEqual(columnsAt(90), [0, 0, 1, 1]);
  assert.deepEqual(columnsAt(-90), [1, 1, 0, 0]);
});

test("the chart exposes labelled cells with one grid tab stop and keyboard instructions", () => {
  const html = render({ rows: 2, columns: 2, values: [[1, 2], [3, null]], ariaLabel: "Activity city" });
  const cells = renderedCells(html);
  assert.match(html, /aria-label="Activity city"/);
  assert.match(html, /class="heatmap3d__scene"[^>]*role="group"/);
  assert.equal(cells.filter((cell) => cell.attributes.tabindex === "0").length, 1);
  assert.equal(cells.filter((cell) => cell.attributes.tabindex === "-1").length, 3);
  for (const cell of cells) assert.ok(cell.attributes["aria-label"].length > 0);
  assert.match(html, /arrow keys to rotate/);
  assert.match(html, /arrow keys to inspect adjacent cells/);
});

test("clickable cells are named buttons and retain custom labels", () => {
  const cells = renderedCells(render({
    rows: 1, columns: 2, values: [[2, null]],
    cellLabel: (cell) => cell.known ? `${cell.value} requests` : "Measurement unavailable",
    onCellClick: () => {},
  }));
  for (const cell of cells) assert.equal(cell.attributes.role, "button");
  assert.deepEqual(byColumn(cells).map((cell) => cell.attributes["aria-label"]), ["2 requests", "Measurement unavailable"]);
});

test("camera controls announce their action and disable the zoom limits", () => {
  const props = { rows: 1, columns: 1, values: [[1]] };
  assert.match(render({ ...props, zoom: 0.55 }), /aria-label="Zoom out" disabled=""/);
  assert.match(render({ ...props, zoom: 2 }), /aria-label="Zoom in" disabled=""/);
  assert.match(render(props), /aria-label="Reset 3D view"/);
  for (const options of [{ interactive: false }, { showControls: false }]) {
    assert.doesNotMatch(render({ ...props, ...options }), /aria-label="Chart camera controls"/);
  }
  const staticHtml = render({ ...props, interactive: false });
  assert.doesNotMatch(staticHtml.match(/<svg class="heatmap3d__scene"[^>]*>/)[0], /tabindex/);
  assert.equal(renderedCells(staticHtml)[0].attributes.tabindex, "0", "static camera must preserve access to the data");
});

test("malformed camera and size options render a finite chart", () => {
  const html = render({
    rows: 1, columns: 2, values: [[0, 5]],
    yaw: NaN, pitch: Infinity, zoom: -Infinity,
    cellSize: NaN, gap: Infinity, maxHeight: NaN,
  });
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  assert.deepEqual(byColumn(renderedCells(html)).map((cell) => cell.attributes["data-height"]), ["0", "100"]);
});

test("an empty grid has no phantom cells or nonfinite paths", () => {
  const html = render({ rows: 0, columns: 0, values: [] });
  assert.equal(renderedCells(html).length, 0);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test("an explicit nonzero domain is labelled at its actual baseline", () => {
  const html = render({ rows: 1, columns: 1, values: [[100]], heightDomain: [10, 100] });
  const axis = html.slice(html.indexOf('<g class="heatmap3d__axis"'), html.indexOf('<g class="heatmap3d__cell"'));
  const labels = [...axis.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((entry) => entry[1]);
  assert.deepEqual(labels, ["10", "55", "100"]);
});

test("theme presets resolve separate top and side face materials", () => {
  const html = render({ rows: 1, columns: 1, values: [[10]], theme: "night" });
  assert.match(html, /data-heatmap3d-theme="night"/);
  const top = html.match(/fill="(#[0-9a-f]+)" class="heatmap3d__surface" data-face="top"/i)?.[1];
  const side = html.match(/fill="(#[0-9a-f]+)" class="heatmap3d__surface" data-face="(?:left|right)"/i)?.[1];
  assert.ok(top && side);
  assert.notEqual(top, side);
});

test("custom face colors and bitmap patterns are represented in the SVG", () => {
  const html = render({
    rows: 1, columns: 1, values: [[10]], material: "pattern",
    faceColor: ({ face }) => face === "top" ? "#ff0000" : "#0000ff",
    patterns: {
      top: [{ width: 4, bitmap: ["1000", "0100"], background: "transparent", foreground: "#ffffff" }],
      side: [{ width: 2, bitmap: ["10", "01"], background: "transparent", foreground: "#111111" }],
    },
  });
  assert.match(html, /<defs>/);
  assert.match(html, /<pattern[^>]+patternUnits="userSpaceOnUse"/);
  assert.match(html, /url\(#heatmap3d-pattern-/);
  assert.match(html, /data-material="pattern"/);
  assert.match(html, /M0 0h1v1H0z/);
  assert.match(html, /fill="#ff0000"/);
  assert.match(html, /fill="#0000ff"/);
});

test("grow animation is opt-in and cells carry a stable stagger index", () => {
  const html = render({ rows: 1, columns: 2, values: [[1, 2]], animation: "grow" });
  assert.match(html, /data-animation="grow"/);
  assert.match(html, /style="--heatmap3d-index:0"/);
  assert.match(html, /style="--heatmap3d-index:1"/);
  assert.match(html, /data-known="true"/);
});

test("the static renderer shares heights, patterns, and finite geometry", () => {
  const props = {
    rows: 1, columns: 3, values: [[1, 10, 100]], maxHeight: 75,
    material: "pattern", animation: "grow", theme: "seasonal", showLegend: true,
  };
  const reactCells = byColumn(renderedCells(render(props)));
  const svg = renderHeatmap3DSvg(props);
  const staticCells = [...svg.matchAll(/<g class="heatmap3d__cell"([^>]*)>/g)]
    .map((match) => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]])))
    .sort((a, b) => Number(a["data-column"]) - Number(b["data-column"]));
  const staticHeights = staticCells.map((cell) => cell["data-height"]);
  assert.deepEqual(staticHeights, reactCells.map((cell) => cell.attributes["data-height"]));
  assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /data-heatmap3d-theme="seasonal"/);
  assert.match(svg, /<style>.*heatmap3d__floor-surface/s);
  assert.match(svg, /prefers-reduced-motion/);
  assert.match(svg, /<defs><pattern/);
  assert.match(svg, /data-animation="grow"/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test("the static renderer emits well-formed markup for every material", () => {
  for (const material of ["solid", "pattern"]) {
    const svg = renderHeatmap3DSvg({ rows: 2, columns: 2, values: [[1, 2], [null, 4]], material, animation: "grow", showLegend: true, rowLabels: ["a", "b"] });
    const markup = svg.replace(/<style>.*?<\/style>/s, "").replace(/<title>[^<]*<\/title>/g, "").replace(/<text([^>]*)>[^<]*<\/text>/g, "<text$1/>");
    for (const [tag] of markup.matchAll(/<[^>]*>/g)) {
      assert.match(tag, /^<\/?[\w:-]+(\s+[\w:-]+="[^"<]*")*\s*\/?>$/, `${material}: ${tag.slice(0, 120)}`);
    }
    assert.match(svg, new RegExp(`data-material="${material}"/>`));
  }
});

test("the static renderer scopes its styles, keyframes, and pattern ids to the chart", () => {
  const options = { rows: 1, columns: 2, values: [[1, 2]], material: "pattern", animation: "grow" };
  const svg = renderHeatmap3DSvg(options);
  const scope = svg.match(/class="[^"]*\b(heatmap3d-static-[a-z0-9]+)\b/)[1];
  const css = svg.match(/<style>(.*?)<\/style>/s)[1];
  const selectors = [...css.replace(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})*\}/g, "").replace(/@media[^{]*\{/g, "").matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .flatMap((match) => match[1].split(","));
  assert.ok(selectors.length > 0);
  for (const selector of selectors) assert.ok(selector.startsWith(`.${scope} `), selector);
  assert.doesNotMatch(css, /@keyframes heatmap3d-(grow|reduced-fade)\b/);
  const ids = [...svg.matchAll(/<pattern id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 0 && ids.every((id) => id.startsWith(`${scope}-`)));
  assert.doesNotMatch(svg, /heatmap3d-static-scope/);

  assert.equal(renderHeatmap3DSvg(options), svg, "same options give the same scope");
  const other = renderHeatmap3DSvg({ ...options, theme: "seasonal" });
  assert.notEqual(other.match(/class="[^"]*\b(heatmap3d-static-[a-z0-9]+)\b/)[1], scope);
});
