import { describe, expect, it } from "vitest";
import { NEUTRAL_SCORE_COLOR, scoreToColor } from "./color";

function channels(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

describe("diverging score colour", () => {
  it("moves from red at the low end to green at the high end", () => {
    const low = channels(scoreToColor(1));
    const high = channels(scoreToColor(10));
    expect(low.r).toBeGreaterThan(low.g);
    expect(high.g).toBeGreaterThan(high.r);
  });

  it("interpolates smoothly across the transition point", () => {
    const lightRed = channels(scoreToColor(5));
    const lightGreen = channels(scoreToColor(6));
    expect(lightRed.r).toBeGreaterThan(lightRed.g);
    expect(lightGreen.g).toBeGreaterThan(lightGreen.r);
  });

  it("uses a neutral colour for unknown cells rather than a misleading one", () => {
    expect(scoreToColor(null)).toBe(NEUTRAL_SCORE_COLOR);
  });
});
