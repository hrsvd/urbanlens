/**
 * Diverging red↔green score scale shared by the selected-cell overlay, the
 * full-grid heatmap, and the legend so every surface reads the same way.
 *
 * Anchors follow the product intent:
 *   10 → deepest green · ~6 → light green (upper transition)
 *   ~5 → light red · 1 → deepest red
 * Values are interpolated smoothly between the stops (a true diverging scale),
 * and missing / unknown cells use a neutral slate rather than a misleading colour.
 */
export const NEUTRAL_SCORE_COLOR = "#5c6b7a";

export const SCORE_COLOR_STOPS: Array<[number, string]> = [
  [1, "#a5303f"],
  [3, "#c05a4c"],
  [5, "#d98d80"],
  [6, "#a7c583"],
  [8, "#5faa6a"],
  [10, "#2f9153"],
];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Interpolated diverging colour for a 0–10 score. Null → neutral slate. */
export function scoreToColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return NEUTRAL_SCORE_COLOR;
  const clamped = Math.min(10, Math.max(SCORE_COLOR_STOPS[0][0], score));
  for (let i = 0; i < SCORE_COLOR_STOPS.length - 1; i += 1) {
    const [lowStop, lowColor] = SCORE_COLOR_STOPS[i];
    const [highStop, highColor] = SCORE_COLOR_STOPS[i + 1];
    if (clamped <= highStop) {
      const t = (clamped - lowStop) / (highStop - lowStop || 1);
      const low = hexToRgb(lowColor);
      const high = hexToRgb(highColor);
      return rgbToHex([
        low[0] + (high[0] - low[0]) * t,
        low[1] + (high[1] - low[1]) * t,
        low[2] + (high[2] - low[2]) * t,
      ]);
    }
  }
  return SCORE_COLOR_STOPS[SCORE_COLOR_STOPS.length - 1][1];
}

/** Lightened tint of a colour, for outlines/edges that must stay legible. */
export function lighten(hex: string, amount = 0.5): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}
