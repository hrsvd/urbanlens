import { describe, expect, it } from "vitest";
import {
  airQualityScore,
  calculateOverallScore,
  rainfallScore,
  riskFromScore,
  scoreFloodSusceptibility,
} from "./scoring";
import type { CellMetric } from "./types";

function metric(key: string, score: number | null, confidence = 0.8): CellMetric {
  return {
    key,
    label: key,
    score,
    ratingOutOf10: score,
    status: score === null ? "unknown" : "moderate",
    explanation: "Test evidence",
    confidence,
    evidence: [],
  };
}

describe("weighted scoring", () => {
  it("re-normalises weights across available metrics", () => {
    const result = calculateOverallScore({
      airQuality: metric("airQuality", 8, 0.9),
      floodSusceptibility: metric("floodSusceptibility", 6, 0.8),
    });
    expect(result.score).toBeGreaterThan(6);
    expect(result.score).toBeLessThan(8);
    expect(result.coverage).toBe(0.55);
  });

  it("does not treat missing metrics as zero", () => {
    const complete = calculateOverallScore({
      airQuality: metric("airQuality", 8),
      floodSusceptibility: metric("floodSusceptibility", 8),
    });
    const partial = calculateOverallScore({ airQuality: metric("airQuality", 8) });
    expect(partial.score).toBeGreaterThan(7);
    expect(partial.confidence).toBeLessThan(complete.confidence);
  });

  it("returns unknown when no evidence can be scored", () => {
    expect(calculateOverallScore({}).score).toBeNull();
    expect(calculateOverallScore({}).riskLevel).toBe("unknown");
  });

  it("classifies boundaries without using safe/dangerous labels", () => {
    expect(riskFromScore(8, 0.8)).toBe("low");
    expect(riskFromScore(6, 0.8)).toBe("moderate");
    expect(riskFromScore(4, 0.8)).toBe("high");
    expect(riskFromScore(9, 0.1)).toBe("unknown");
  });
});

describe("metric conversion", () => {
  it("converts PM2.5 and AQI to a monotonic 10-point rating", () => {
    expect(airQualityScore(5, 20)).toBeGreaterThan(airQualityScore(25, 90)!);
    expect(airQualityScore(null, null)).toBeNull();
  });

  it("reduces rainfall context rating as accumulated rainfall rises", () => {
    expect(rainfallScore(0, 0)).toBe(10);
    expect(rainfallScore(20, 30)).toBe(5);
    expect(rainfallScore(null, null)).toBeNull();
  });
});

describe("flood susceptibility", () => {
  it("raises susceptibility near documented flood evidence", () => {
    const near = scoreFloodSusceptibility({
      distanceToKnownFloodPointMeters: 80,
      distanceToDrainMeters: 60,
      distanceToLakeMeters: 700,
      relativeElevationMeters: null,
      localSlopeDegrees: null,
      rainfallLast24HoursMm: 15,
      forecastRainfall24HoursMm: 20,
    });
    const far = scoreFloodSusceptibility({
      distanceToKnownFloodPointMeters: 1600,
      distanceToDrainMeters: 500,
      distanceToLakeMeters: 1200,
      relativeElevationMeters: null,
      localSlopeDegrees: null,
      rainfallLast24HoursMm: 0,
      forecastRainfall24HoursMm: 0,
    });
    expect(near.score!).toBeLessThan(far.score!);
    expect(near.explanation).toContain("indicator, not a flood prediction");
  });

  it("returns insufficient evidence rather than a fabricated score", () => {
    const result = scoreFloodSusceptibility({
      distanceToKnownFloodPointMeters: null,
      distanceToDrainMeters: null,
      distanceToLakeMeters: null,
      relativeElevationMeters: null,
      localSlopeDegrees: null,
      rainfallLast24HoursMm: null,
      forecastRainfall24HoursMm: null,
    });
    expect(result.score).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
