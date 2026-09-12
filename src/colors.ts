import type { Heatmap3DFace, Heatmap3DThemeName } from "./types.js";

/**
 * Ramp derivation.
 *
 * Passing an explicit `colors` array is always an option, but most callers
 * have one brand colour and want a ladder from it. Deriving the ramp keeps
 * the palest band tied to the surface behind it, which is why `ground`
 * matters: fading toward white on a dark card washes the low end out.
 */
export type RampOptions = {
  levels?: number;
  /** The surface the cells sit on. Pale bands fade toward this. */
  ground?: string;
  /** What the darkest band leans into. Defaults to black on light grounds. */
  peak?: string;
};

type Rgb = { r: number; g: number; b: number };

export type Heatmap3DThemePreset = {
  colors: readonly string[];
  emptyColor: string;
  floor: string;
  floorEdge: string;
  grid: string;
  ink: string;
  window: string;
};

/**
 * Small, concrete presets keep the 3D component usable without a token
 * system. The colour ramps stay in hex because that is the public notation of
 * this package and can be copied straight into a static SVG.
 */
export const HEATMAP_3D_THEMES = {
  green: {
    colors: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
    emptyColor: "#e5e9e7",
    floor: "#f0f1f3",
    floorEdge: "#d9dde2",
    grid: "#d9dde2",
    ink: "#7b838e",
    window: "#f7fff5",
  },
  night: {
    colors: ["#b8d4ff", "#78a8f5", "#4e7fe0", "#2f56b7"],
    emptyColor: "#343a43",
    floor: "#24272d",
    floorEdge: "#353a43",
    grid: "#3d424b",
    ink: "#a6afbc",
    window: "#ffd786",
  },
  seasonal: {
    colors: ["#f8e8f1", "#f3b6d2", "#d779ac", "#9d4d80"],
    emptyColor: "#eeeae5",
    floor: "#f0f1f3",
    floorEdge: "#d9dde2",
    grid: "#d9dde2",
    ink: "#7b838e",
    window: "#fffaf0",
  },
  rainbow: {
    colors: ["#e85d75", "#e7b84b", "#45b97c", "#547de8"],
    emptyColor: "#e8eaf0",
    floor: "#f0f1f3",
    floorEdge: "#d9dde2",
    grid: "#d9dde2",
    ink: "#687080",
    window: "#fff8dd",
  },
} as const satisfies Record<Heatmap3DThemeName, Heatmap3DThemePreset>;

const SEASONAL_RAMPS = [
  ["#f8e8f1", "#f3b6d2", "#d779ac", "#9d4d80"], // spring
  ["#e8f6df", "#a9da8d", "#56b35d", "#227a3a"], // summer
  ["#fff1d5", "#f5c26b", "#e68532", "#b2471e"], // autumn
  ["#eef2f5", "#b9c6d5", "#7b8ca4", "#4d5b73"], // winter
] as const;

export function parseHex(value: string): Rgb | null {
  const normalized = value.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  return (
    "#" +
    [r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")
  );
}

export function mix(from: Rgb, to: Rgb, weight: number): Rgb {
  const blend = (a: number, b: number) => a + (b - a) * weight;
  return { r: blend(from.r, to.r), g: blend(from.g, to.g), b: blend(from.b, to.b) };
}

/** Mix two hexadecimal colours while retaining the package's hex notation. */
export function mixHex(from: string, to: string, weight: number): string {
  const fromRgb = parseHex(from);
  const toRgb = parseHex(to);
  if (!fromRgb || !toRgb) return from;
  return toHex(mix(fromRgb, toRgb, Math.min(1, Math.max(0, weight))));
}

function resampleRamp(stops: readonly string[], levels: number): string[] {
  if (stops.length === 0) return [];
  if (stops.length === 1) return Array.from({ length: Math.max(1, levels) }, () => stops[0]);
  if (levels <= 1) return [stops[stops.length - 1]];
  if (levels === stops.length) return [...stops];
  return Array.from({ length: levels }, (_, index) => {
    const position = (index / (levels - 1)) * (stops.length - 1);
    const lower = Math.min(stops.length - 2, Math.floor(position));
    const weight = position - lower;
    return mixHex(stops[lower], stops[lower + 1], weight);
  });
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360 / 60;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(h % 2 - 1));
  const match = l - chroma / 2;
  const channels = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return toHex({ r: (channels[0] + match) * 255, g: (channels[1] + match) * 255, b: (channels[2] + match) * 255 });
}

export function resolve3DTheme(theme: Heatmap3DThemeName = "green"): Heatmap3DThemePreset {
  return HEATMAP_3D_THEMES[theme];
}

export function resolve3DColors({
  theme = "green",
  colors,
  column = 0,
  columns = 1,
  levels = 4,
}: {
  theme?: Heatmap3DThemeName;
  colors?: readonly string[];
  column?: number;
  columns?: number;
  levels?: number;
}): string[] {
  const count = Math.max(1, Math.floor(levels));
  if (colors && colors.length > 0) return resampleRamp(colors, count);
  if (theme === "seasonal") {
    const normalized = Math.min(1, Math.max(0, column / Math.max(1, columns - 1)));
    const position = normalized * (SEASONAL_RAMPS.length - 1);
    const lower = Math.min(SEASONAL_RAMPS.length - 2, Math.floor(position));
    const weight = position - lower;
    const blended = SEASONAL_RAMPS[lower].map((color, index) => mixHex(color, SEASONAL_RAMPS[lower + 1][index], weight));
    return resampleRamp(blended, count);
  }
  if (theme === "rainbow") {
    const progress = column / Math.max(1, columns);
    return Array.from({ length: count }, (_, index) => {
      const levelProgress = count === 1 ? 0.5 : index / (count - 1);
      return hslToHex(progress * 360 + levelProgress * 28, 0.72, 0.38 + levelProgress * 0.25);
    });
  }
  return resampleRamp(resolve3DTheme(theme).colors, count);
}

/**
 * Concrete face fills are useful to both the React and string renderers. The
 * top is lifted toward white; visible sides lean toward black, with a gentler
 * treatment for the bright night preset.
 */
export function resolve3DFaceColor({
  color,
  face,
  theme = "green",
  cell,
  level,
  faceColor,
}: {
  color: string;
  face: Heatmap3DFace;
  theme?: Heatmap3DThemeName;
  cell: import("./types.js").ResolvedCell;
  level: number;
  faceColor?: import("./types.js").Heatmap3DFaceColor;
}): string {
  const custom = faceColor?.({ cell, face, color, level, theme });
  if (custom) return custom;
  return face === "top"
    ? mixHex(color, "#ffffff", theme === "night" ? 0.1 : 0.07)
    : mixHex(color, "#071b19", theme === "night" ? 0.16 : 0.2);
}

/** Relative luminance, for deciding whether a ground reads as light or dark. */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 1;
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * A ramp from one base colour, palest first. Returns `[base]` when the colour
 * cannot be parsed, so a bad value degrades to a flat ramp rather than throwing.
 */
export function deriveRamp(base: string, options: RampOptions = {}): string[] {
  const { levels = 4, ground = "#ffffff" } = options;
  const baseRgb = parseHex(base);
  const groundRgb = parseHex(ground) ?? { r: 255, g: 255, b: 255 };
  if (!baseRgb) return [base];

  // On a dark ground the top band brightens rather than darkens, otherwise the
  // strongest cells disappear into the background.
  const groundIsDark = luminance(ground) < 0.2;
  const peakRgb =
    parseHex(options.peak ?? "") ??
    (groundIsDark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 });

  return Array.from({ length: levels }, (_, index) => {
    const position = levels === 1 ? 1 : index / (levels - 1);
    // The last band leans slightly past the base toward the peak; the rest
    // fade back toward the ground.
    if (position >= 1) return toHex(mix(baseRgb, peakRgb, 0.1));
    const towardGround = 0.8 * (1 - position);
    return toHex(mix(baseRgb, groundRgb, towardGround));
  });
}
