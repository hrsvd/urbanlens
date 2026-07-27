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
    // airQuality weight=0.17, floodSusceptibility weight=0.19 → coverage=0.36
    expect(result.score).toBeGreaterThan(5);
    expect(result.score).toBeLessThan(8);
    expect(result.coverage).toBe(0.36);
  });

  it("confidence-adjusts each metric toward neutral (5.0) before weighting", () => {
    // A metric with low confidence should not be able to push the composite far
    // from neutral, even if its raw score is extreme.
    const highConfidence = calculateOverallScore({
      airQuality: metric("airQuality", 9, 0.95),
    });
    const lowConfidence = calculateOverallScore({
      airQuality: metric("airQuality", 9, 0.30),
    });
    // Low-confidence metric is pulled toward 5.0; its composite contribution is lower.
    expect(highConfidence.score!).toBeGreaterThan(lowConfidence.score!);
    // Low-confidence 9.0 adjusted: 9×0.30 + 5×0.70 = 6.2, not 9.0
    expect(lowConfidence.score!).toBeGreaterThan(5.0);
    expect(lowConfidence.score!).toBeLessThan(7.0);
  });

  it("does not treat missing metrics as zero", () => {
    const complete = calculateOverallScore({
      airQuality: metric("airQuality", 8),
      floodSusceptibility: metric("floodSusceptibility", 8),
    });
    const partial = calculateOverallScore({ airQuality: metric("airQuality", 8) });
    expect(partial.score).toBeGreaterThan(5);
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

  it("metrics with ratingOutOf10 null are excluded from scoring", () => {
    const withContext = calculateOverallScore({
      airQuality: metric("airQuality", 8, 0.9),
      // drainProximity is not in DEFAULT_WEIGHTS so it is never scored
      // regardless of ratingOutOf10, but test the null path explicitly.
      floodSusceptibility: { ...metric("floodSusceptibility", null), ratingOutOf10: null },
    });
    const withoutContext = calculateOverallScore({
      airQuality: metric("airQuality", 8, 0.9),
    });
    // Both should produce the same score (floodSusceptibility is excluded)
    expect(withContext.score).toBe(withoutContext.score);
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
