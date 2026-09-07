# heatmap-ui

A headless heatmap for React. Any grid, not just calendars — and it does not
lie about gaps.

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
| `tooltip`, `cellLabel` | — | `(cell) => ReactNode` / `=> string`. |
| `onCellClick` | — | Makes cells buttons. |
| `showLegend` | `false` | less/more key, plus "no data" when relevant. |

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

It owns everything date-shaped: mapping dates onto the grid, month labels,
weekday labels, and a default accessible name per day. Days after `to` are
hidden rather than drawn as missing, so the final column is honestly partial.
Every `Heatmap` prop passes through.

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
}
```

Tooltip colours follow `prefers-color-scheme`; set
`data-heatmap-theme="light" | "dark"` to pin them.

## Playground

```bash
npm run build
npx serve .
```

Open `examples/playground.html` — every prop, a calendar, a punchcard, and all
eight shapes side by side.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT.
