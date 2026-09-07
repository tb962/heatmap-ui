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
