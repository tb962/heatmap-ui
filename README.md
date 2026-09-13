# heatmap-ui

[![CI](https://github.com/tb962/heatmap-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/tb962/heatmap-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@tb962/heatmap-ui.svg)](https://www.npmjs.com/package/@tb962/heatmap-ui)
[![license](https://img.shields.io/npm/l/@tb962/heatmap-ui.svg)](LICENSE)

A headless heatmap for React. Any grid, not just calendars — and it does not
lie about gaps.

**[Try it in the playground →](https://tb962.github.io/heatmap-ui/)**

```bash
npm install @tb962/heatmap-ui
```

```tsx
import { CalendarHeatmap } from "@tb962/heatmap-ui";
import "@tb962/heatmap-ui/styles.css";

<CalendarHeatmap values={days} weeks={20} showLegend />;
```

## Why another one

Most React heatmaps are GitHub-calendar clones that get two things wrong.

**They flatten your data.** Shade bands are usually cut at fractions of the
largest value. Real activity data is heavy-tailed — one long day can be twenty
times the median — so most of the chart collapses into the palest shade. On a
real dataset, linear banding put 58% of active days in band 1; quantile
banding put 25% in each.

```
linear    ████████████████████████████ ▓▓▓▓▓▓▓▓▓▓▓▓ ▒▒▒ ░░░░░
quantile  ████████████ ▓▓▓▓▓▓▓▓▓▓▓▓ ▒▒▒▒▒▒▒▒▒▒▒▒ ░░░░░░░░░░░░
```

`scale="quantile"` is the default here. `"linear"` and `"log"` are available,
as is any function you like.

**They confuse "no data" with "zero".** A day your collector could not observe
is not a day you did nothing. Pass `known: false` and the slot renders at
reduced opacity and reads as "No data" to a screen reader, instead of
implying a day off.

**And they assume a calendar.** The core takes `rows` and `columns`. A
24 × 7 punchcard, a months × years grid, or an arbitrary matrix are all just
heatmaps. `CalendarHeatmap` is a thin adapter on top, not the foundation.

## The core

```tsx
import { Heatmap } from "@tb962/heatmap-ui";

<Heatmap rows={24} columns={7} values={matrix} />;
```

`values` accepts either shape:

```ts
// Dense. null means no data; 0 means measured and empty.
values={[[3, 0, null], [1, 5, 2]]}

// Sparse. Anything not listed has no data.
values={[{ row: 0, column: 0, value: 3, known: true, meta: anything }]}
```

| Prop | Default | |
| --- | --- | --- |
| `rows`, `columns` | — | Grid size. Required. |
| `values` | `[]` | Matrix or sparse cells. |
| `scale` | `"quantile"` | `"quantile"`, `"linear"`, `"log"`, or `(value, all) => 0..1`. |
| `levels` | `colors.length` | Number of shade bands. |
| `thresholds` | — | Explicit band ceilings; skips `scale`. |
| `shape` | `"rounded"` | See below. |
| `encode` | `"color"` | `"color"`, `"size"`, or `"both"`. |
| `cellSize` | `13` | Pixels. |
| `gap` | `3` | Pixels. |
| `radius` | — | Overrides the shape's corner rounding. |
| `colors` | GitHub green | The ramp, palest first. |
| `emptyColor` | `#ebedf0` | A known value of zero. |
| `unknownOpacity` | `0.5` | Applied to slots with no data. |
| `isSlotHidden` | — | `(row, column) => boolean` for ragged grids. |
| `rowLabels`, `columnLabels` | — | Positioned against the grid. |
| `tooltip` | — | `(cell) => ReactNode`; opens on hover and focus. |
| `cellContent` | — | Optional visual React node centred inside each cell; values are hidden unless provided. |
| `cellLabel` | — | `(cell) => string`; the accessible name for a cell. |
| `onCellClick` | — | Makes cells buttons. |
| `showLegend` | `false` | less/more key, plus "no data" when relevant. |

## 3D heatmaps

Use `Heatmap3D` for any grid, or `CalendarHeatmap3D` for dates. Both render
an interactive, shaded SVG scene without a WebGL dependency.

```tsx
import { Heatmap3D, CalendarHeatmap3D } from "@tb962/heatmap-ui";
import "@tb962/heatmap-ui/styles.css";

<Heatmap3D
  rows={2}
  columns={3}
  values={[[20, 40, 80], [0, null, 60]]}
  shape="rectangle"
  blockStyle="lego"
  maxHeight={75}
  showLegend
  tooltip={cell => cell.known ? `${cell.value} events` : "No data"}
/>;

<CalendarHeatmap3D values={days} weeks={20} blockStyle="building" />;
```

Height is proportional to the actual value: with the default domain, 40 is
twice as tall as 20. The `scale`, `levels`, and `thresholds` props only affect
colour bands. LEGO studs fit inside that height. A measured zero is a flat
tile; missing data is outlined; hidden slots are omitted entirely.

| Prop | Default | Behaviour |
| --- | --- | --- |
| `shape` | `"rectangle"` | `"rectangle"`, `"circle"` (cylinder), or `"bar"` (slender column). |
| `blockStyle` | `"solid"` | `"solid"`, `"lego"` (studs), or `"building"` (windowed facades). |
| `theme` | `"green"` | `"green"`, `"night"`, `"seasonal"`, or `"rainbow"`; presets include face-aware palette neutrals. |
| `material` | `"solid"` | `"solid"` or `"pattern"`; pattern material uses SVG bitmap marks over each face. |
| `patterns` | built-in | Optional `{ top, side }` arrays of `{ width, bitmap, background, foreground }`, indexed by colour level. |
| `faceColor` | preset shading | `(args) => string` resolver for different top, left, and right fills. |
| `animation` | `"none"` | `"grow"` adds a staggered entrance; the stylesheet swaps to a no-travel fade for reduced motion. |
| `maxHeight` | `100` | Maximum elevation in the same grid units as cell size and gap. |
| `heightDomain` | `[0, largest positive value]` | Fixed numeric domain for comparisons across charts. Out-of-range values clamp. |
| `yaw`, `pitch`, `zoom` | `-35`, `38`, `1` | Camera orbit, elevation, and magnification. |
| `onCameraChange` | — | Receives `{ yaw, pitch, zoom }` after camera interactions. |
| `interactive` | `true` | Enables pointer dragging and keyboard camera control. |
| `showControls` | `true` | Shows zoom and camera-reset buttons. |

The shared data, labels, colours, tooltips, click callbacks, and legend props
work in 3D. `encode`, `radius`, and `minScale` belong to the 2D component.
Negative values retain their labels but render at the zero plane; this first
3D version is intended for nonnegative activity and magnitude data.

Drag to orbit. Focus the chart and use arrow keys to rotate, `+` / `-` to
zoom, or `Home` to reset. Cells expose their values to assistive technology,
and click handlers also respond to Enter or Space.

### Patterns, themes, and static SVG

The built-in patterns are deliberately small and repeatable. A row can be a
number, a hexadecimal string, or a binary string, with its most-significant bit
drawn on the left:

```tsx
<Heatmap3D
  rows={1}
  columns={3}
  values={[[2, 8, 20]]}
  theme="night"
  material="pattern"
  animation="grow"
  patterns={{
    top: [{ width: 4, bitmap: ["1000", "0100", "0010", "0001"] }],
    side: [{ width: 2, bitmap: ["10", "01"] }],
  }}
/>
```

For an email, README, or scheduled asset, use the same scene without React or
a DOM:

```ts
import { renderHeatmap3DSvg } from "@tb962/heatmap-ui";

const svg = renderHeatmap3DSvg({
  rows: 1,
  columns: 3,
  values: [[2, 8, 20]],
  theme: "seasonal",
  material: "pattern",
  showLegend: true,
});
```

`renderHeatmap3DSvg` shares the height domain, geometry, face visibility, paint
order, themes, and pattern definitions with `Heatmap3D`; its output is a
non-interactive accessible SVG snapshot.

## Shapes

| | |
| --- | --- |
| `rounded` `square` `circle` | The familiar three. |
| `diamond` | A 45° square. Reads denser over long ranges. |
| `hexagon` | Offset rows, honeycomb. The standard form for hex-binned data. |
| `plus` | Stays legible at sizes where circles turn to mush. |
| `bar` | Height tracks the value; colour stays flat. |
| `ring` | Stroke thickness tracks the value. Works on any ground. |

## Encoding without colour

Colour alone is invisible to roughly one reader in twelve.

```tsx
<Heatmap encode="both" ... />
```

`"size"` scales each cell within its slot so intensity survives in greyscale;
`"both"` encodes it twice. `minScale` sets how small the weakest cell may get.

### Values inside cells

`cellContent` is a visual slot for short values, counts, or other compact
content. It is deliberately separate from `cellLabel`, so a dense visual can
still have a complete accessible description:

```tsx
<Heatmap
  rows={7}
  columns={20}
  values={activity}
  cellContent={(cell) => cell.known && cell.value > 0 ? cell.value : null}
  cellLabel={(cell) => cell.known ? `${cell.value} events` : "No data"}
/>
```

The content is marked decorative for assistive technology; use `cellLabel` for
meaning. It is a flat-grid feature. The 3D add-on keeps its values in labels
and tooltips so it can remain an SVG renderer without an HTML overlay layer.

## Calendar

```tsx
<CalendarHeatmap
  values={[{ date: "2026-09-07", value: 12 }]}
  to="2026-09-07"
  weeks={20}
  weekStart={1}
  showMonthLabels
  showWeekdayLabels
  unitLabel="commits"
  tooltip={(day) => `${day.date}: ${day.value}`}
/>
```

`weeks` defaults to 53 when omitted.

It owns everything date-shaped: mapping dates onto the grid, month labels,
weekday labels, and a default accessible name per day. Days after `to` are
hidden rather than drawn as missing, so the final column is honestly partial.
Every `Heatmap` prop passes through.

## Recipes

The core takes `rows` and `columns`, so most "kinds" of heatmap are a shape of
data rather than a different component. Nothing below is a special mode — it is
all `Heatmap` with different numbers. The playground emits exactly these, for
whatever you have tweaked.

### Punchcard — hours down, weekdays across

```tsx
const hourLabels = Array.from({ length: 24 }, (_, i) => (i % 6 === 0 ? `${i}:00` : ""));
const dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((text, column) => ({ column, text }));

<Heatmap
  rows={24}
  columns={7}
  values={commits}                    // number[24][7]
  rowLabels={hourLabels}
  columnLabels={dayLabels}
  ariaLabel="Commits by hour and weekday"
  tooltip={(cell) => `${cell.row}:00 — ${cell.value}`}
/>
```

### Cohort retention — a grid that is genuinely ragged

A cohort that signed up last week has no week-10 number, and never will until
ten weeks pass. That slot does not exist, so `isSlotHidden` keeps it out of the
grid entirely — which is not the same as `known: false`, a slot that exists and
was not measured.

```tsx
<Heatmap
  rows={cohorts.length}
  columns={12}
  values={retention}                  // { row, column, value }[]
  isSlotHidden={(row, column) => column >= cohorts.length - row}
  rowLabels={cohorts}                 // ["Jul 6", "Jul 13", …]
  columnLabels={Array.from({ length: 12 }, (_, column) => ({ column, text: `W${column}` }))}
  ariaLabel="Retention by signup cohort"
  tooltip={(cell) => `Week ${cell.column} — ${cell.value}% retained`}
/>
```

### Uptime — wide and short, with days that were never collected

The other kind of gap. These slots exist; nobody was watching them.

```tsx
<Heatmap
  rows={services.length}
  columns={30}
  values={uptime}                     // { row, column, value, known }[]
  rowLabels={services}                // ["api", "web", …]
  columnLabels={dayLabels}
  ariaLabel="Service uptime by day"
  tooltip={(cell) =>
    cell.known ? `${cell.value}% up` : "not monitored"}
/>
```

### Co-occurrence — symmetric, diagonal removed

The diagonal is every label matched against itself, which is noise at full
strength. Drop it rather than let it dominate the scale.

```tsx
<Heatmap
  rows={topics.length}
  columns={topics.length}
  values={overlap}                    // symmetric: value(i, j) === value(j, i)
  isSlotHidden={(row, column) => row === column}
  rowLabels={topics}
  columnLabels={topics.map((text, column) => ({ column, text }))}
  ariaLabel="Label co-occurrence"
/>
```

### A note on label density

`Heatmap` positions the text you give it and cannot measure it, so it will
happily draw `"Wednesday"` across a 16px column and let it collide with its
neighbour. Deciding how many labels fit is the caller's job. Either pick a
shorter form, or thin them:

```tsx
// Keep only as many labels as the column stride can hold.
function thinLabels(texts, stride) {
  const widest = Math.max(...texts.map((t) => t.length)) * 6 + 8; // ~6px/char at 10px
  const step = Math.max(1, Math.ceil(widest / stride));
  return texts
    .map((text, column) => ({ column, text }))
    .filter((_, i) => i % step === 0);
}

columnLabels={thinLabels(dates, cellSize + gap)}
```

`CalendarHeatmap` already does this for month labels, dropping one that would
land too close to the previous.

## Accessibility

- The grid is a labelled `group`. It is not `role="img"`, which would hide the
  focusable cells inside it.
- Cells take focus only when they carry information — a `cellLabel`, a
  `tooltip`, or an `onCellClick`.
- Tooltips open on focus as well as hover, after a 300ms delay, and are wired
  with `aria-describedby`.
- `encode` exists so intensity is not carried by colour alone.
- Hover and focus scaling is dropped under `prefers-reduced-motion`.

## Styling

The stylesheet is structural. Colour comes from props, so there is no token
layer to fight. The few colours it does define belong to the tooltip:

```css
.heatmap {
  --heatmap-tooltip-bg: …;
  --heatmap-tooltip-text: …;
  --heatmap-label: …;
  --heatmap-cell-content-color: …;
}
```

Tooltip colours follow `prefers-color-scheme`; set
`data-heatmap-theme="light" | "dark"` to pin them.

## Playground

**<https://tb962.github.io/heatmap-ui/>** — no install required.

To run it against your own working copy:

```bash
npm run build
npx serve .
```

Open `examples/playground.html`. Switch between 2D and 3D, choose Solid, LEGO,
or Skyline cells, and orbit the scene. Pick a graph — calendar, punchcard, cohort
retention, co-occurrence, uptime — tweak any prop, and the panel below the
chart shows the code that renders exactly what you are looking at, imports and
all.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the longer version, and
[SECURITY.md](SECURITY.md) to report a vulnerability.

## License

MIT.
