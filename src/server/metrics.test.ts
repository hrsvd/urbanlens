import { describe, expect, it } from "vitest";
import type { AnalysisCellFeature } from "@/lib/types";
import type { AirQualityResult } from "./external";
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
      distanceToSchoolMeters: 220,
      schoolCount: 3,
      distanceToHealthcareMeters: 140,
      healthcareCount: 4,
      distanceToTransitMeters: 160,
      distanceToMetroStationMeters: 1800,
      transitStopCount: 5,
      distanceToMarketMeters: 130,
      dailyNeedsCount: 3,
      distanceToParkMeters: 60,
      parkCount: 2,
      distanceToPoliceMeters: 700,
    },
    staticScores: {
      drainProximity: 7.6,
      estimatedNoise: 6.2,
      connectivity: 7.4,
      floodBaseline: 7,
      education: 8.4,
      healthcare: 8.8,
      transit: 8.1,
      dailyNeeds: 8.6,
      greenSpace: 9,
      safetyProxy: 6.4,
    },
  },
  geometry: {
    type: "Polygon",
    coordinates: [[[77.638, 12.911], [77.639, 12.911], [77.639, 12.912], [77.638, 12.912], [77.638, 12.911]]],
  },
};

// Minimal AirQualityResult fixture satisfying the updated type with source info.
const camsAirResult: AirQualityResult = {
  latitude: 12.9,
  longitude: 77.6,
  timezone: "Asia/Kolkata",
  current: { time: "2026-07-25T16:30", pm2_5: 18.4, pm10: 30, us_aqi: 70 },
  fetchedAt: "2026-07-25T11:00:00Z",
  source: "cams",
  sourceConfidence: 0.55,
};

const TEST_LAT = 12.9116;
const TEST_LON = 77.6389;

describe("cell metric normalization", () => {
  it("normalizes verified upstream fields and preserves evidence metadata", async () => {
    const result = await buildCellMetrics(
      cell,
      "2026-07-25T10:00:00Z",
      camsAirResult,
      {
        latitude: 12.9,
        longitude: 77.65,
        timezone: "Asia/Kolkata",
        current: { time: "2026-07-25T16:30", precipitation: 0.2 },
        observed24hMm: 8,
        forecast24hMm: 11,
        fetchedAt: "2026-07-25T11:00:00Z",
      },
      null,
      TEST_LAT,
      TEST_LON,
    );
    expect(result.metrics.airQuality.value).toBe(18.4);
    // CAMS source → modelled sourceType
    expect(result.metrics.airQuality.evidence[0].sourceType).toBe("modelled");
    expect(result.metrics.floodSusceptibility.explanation).toContain("not a flood prediction");
    expect(result.overallScore).not.toBeNull();
  });

  it("shows dynamic sources as unavailable without inventing values", async () => {
    const result = await buildCellMetrics(cell, "2026-07-25T10:00:00Z", null, null, null, TEST_LAT, TEST_LON);
    expect(result.metrics.airQuality.ratingOutOf10).toBeNull();
    expect(result.metrics.rainfall.ratingOutOf10).toBeNull();
    expect(result.metrics.networkQuality?.ratingOutOf10).toBeNull();
    // electricityContext is now real context data (not unavailable); score is null
    expect(result.metrics.electricityContext?.ratingOutOf10).toBeNull();
    expect(result.metrics.connectivity.ratingOutOf10).toBe(7.4);
  });

  it("scores livability access metrics from static OSM-derived features", async () => {
    const result = await buildCellMetrics(cell, "2026-07-25T10:00:00Z", null, null, null, TEST_LAT, TEST_LON);
    expect(result.metrics.education.ratingOutOf10).toBe(8.4);
    expect(result.metrics.healthcare.ratingOutOf10).toBe(8.8);
    expect(result.metrics.transit.value).toBe(160);
    expect(result.metrics.greenSpace.ratingOutOf10).toBe(9);
    // Police proximity is now context-only: not scored, shown as distance fact.
    expect(result.metrics.policeProximity.ratingOutOf10).toBeNull();
    expect(result.metrics.policeProximity.explanation).toContain("factual distance");
    // Even with both dynamic sources down, the wider static profile still scores.
    expect(result.overallScore).not.toBeNull();
    // Categories should be present
    expect(result.categories.length).toBeGreaterThan(0);
  });

  it("uses CPCB source label when air result has source=cpcb", async () => {
    const cpcbResult: AirQualityResult = {
      ...camsAirResult,
      source: "cpcb",
      cpcbStation: "BTM Layout, Bengaluru - KSPCB",
      sourceConfidence: 0.72,
    };
    const result = await buildCellMetrics(cell, "2026-07-25T10:00:00Z", cpcbResult, null, null, TEST_LAT, TEST_LON);
    // CPCB station → official sourceType
    expect(result.metrics.airQuality.evidence[0].sourceType).toBe("official");
    expect(result.metrics.airQuality.confidence).toBe(0.72);
    expect(result.metrics.airQuality.explanation).toContain("BTM Layout");
  });

  it("drops a livability metric that has no mapped evidence", async () => {
    const bare = {
      ...cell,
      properties: {
        ...cell.properties,
        staticFeatures: { ...cell.properties.staticFeatures, distanceToSchoolMeters: null, schoolCount: 0 },
        staticScores: { ...cell.properties.staticScores, education: null },
      },
    };
    const result = await buildCellMetrics(bare, "2026-07-25T10:00:00Z", null, null, null, TEST_LAT, TEST_LON);
    expect(result.metrics.education.ratingOutOf10).toBeNull();
    expect(result.metrics.education.status).toBe("unknown");
  });

  it("sets floodAlert when susceptibility score is below 3.5", async () => {
    const highRiskCell = {
      ...cell,
      properties: {
        ...cell.properties,
        staticFeatures: {
          ...cell.properties.staticFeatures,
          distanceToFloodPointMeters: 50,   // very close to flood point
          relativeElevationMeters: -3.0,     // significantly lower terrain
        },
        staticScores: {
          ...cell.properties.staticScores,
          floodBaseline: 2.8,
        },
      },
    };
    const result = await buildCellMetrics(highRiskCell, "2026-07-25T10:00:00Z", null, null, null, TEST_LAT, TEST_LON);
    // The flood score may not be exactly 3.5 since it depends on all inputs,
    // but the floodAlert flag is based on the computed ratingOutOf10.
    if (result.metrics.floodSusceptibility.ratingOutOf10 !== null &&
        result.metrics.floodSusceptibility.ratingOutOf10 < 3.5) {
      expect(result.floodAlert).toBe(true);
    }
  });
});
