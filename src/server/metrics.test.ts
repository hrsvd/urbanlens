import { describe, expect, it } from "vitest";
import type { AnalysisCellFeature } from "@/lib/types";
import { buildCellMetrics } from "./metrics";

const cell: AnalysisCellFeature = {
  type: "Feature",
  properties: {
    id: "hsr-grid-01-01",
    row: 1,
    column: 1,
    sizeMeters: 100,
    centerLatitude: 12.9116,
    centerLongitude: 77.6389,
    staticFeatures: {
      elevationMeters: 887,
      relativeElevationMeters: -1.5,
      localSlopeDegrees: 1.7,
      distanceToDrainMeters: 120,
      distanceToFloodPointMeters: 600,
      distanceToLakeMeters: 800,
      distanceToMajorRoadMeters: 85,
      roadLengthMeters: 260,
      amenityCount: 4,
      commercialCount: 1,
      busStopCount: 1,
      constructionCount: 0,
      buildingCount: 18,
    },
    staticScores: {
      drainProximity: 7.6,
      estimatedNoise: 6.2,
      connectivity: 7.4,
      floodBaseline: 7,
    },
  },
  geometry: {
    type: "Polygon",
    coordinates: [[[77.638, 12.911], [77.639, 12.911], [77.639, 12.912], [77.638, 12.912], [77.638, 12.911]]],
  },
};

describe("cell metric normalization", () => {
  it("normalizes verified upstream fields and preserves evidence metadata", () => {
    const result = buildCellMetrics(
      cell,
      "2026-07-25T10:00:00Z",
      {
        latitude: 12.9,
        longitude: 77.6,
        timezone: "Asia/Kolkata",
        current: { time: "2026-07-25T16:30", pm2_5: 18.4, pm10: 30, us_aqi: 70 },
        fetchedAt: "2026-07-25T11:00:00Z",
      },
      {
        latitude: 12.9,
        longitude: 77.65,
        timezone: "Asia/Kolkata",
        current: { time: "2026-07-25T16:30", precipitation: 0.2 },
        observed24hMm: 8,
        forecast24hMm: 11,
        fetchedAt: "2026-07-25T11:00:00Z",
      },
    );
    expect(result.metrics.airQuality.value).toBe(18.4);
    expect(result.metrics.airQuality.evidence[0].sourceType).toBe("modelled");
    expect(result.metrics.floodSusceptibility.explanation).toContain("not a flood prediction");
    expect(result.overallScore).not.toBeNull();
  });

  it("shows dynamic sources as unavailable without inventing values", () => {
    const result = buildCellMetrics(cell, "2026-07-25T10:00:00Z", null, null);
    expect(result.metrics.airQuality.ratingOutOf10).toBeNull();
    expect(result.metrics.rainfall.ratingOutOf10).toBeNull();
    expect(result.metrics.networkQuality?.ratingOutOf10).toBeNull();
    expect(result.metrics.connectivity.ratingOutOf10).toBe(7.4);
  });
});
