import { describe, expect, it } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import { coordinateToCell, haversineDistanceMeters, lonLatToMercator, mercatorToLonLat } from "./geo";
import type { AnalysisCellProperties } from "./types";

const baseProperties = {
  row: 0,
  column: 0,
  sizeMeters: 100,
  centerLatitude: 12.91,
  centerLongitude: 77.64,
  staticFeatures: {
    elevationMeters: null,
    relativeElevationMeters: null,
    localSlopeDegrees: null,
    distanceToDrainMeters: null,
    distanceToFloodPointMeters: null,
    distanceToLakeMeters: null,
    distanceToMajorRoadMeters: null,
    roadLengthMeters: 0,
    amenityCount: 0,
    commercialCount: 0,
    busStopCount: 0,
    constructionCount: 0,
    buildingCount: 0,
  },
  staticScores: {
    drainProximity: null,
    estimatedNoise: null,
    connectivity: null,
    floodBaseline: null,
  },
};

const cells: FeatureCollection<Polygon, AnalysisCellProperties> = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { ...baseProperties, id: "hsr-grid-test" },
    geometry: {
      type: "Polygon",
      coordinates: [[[77.63, 12.9], [77.65, 12.9], [77.65, 12.92], [77.63, 12.92], [77.63, 12.9]]],
    },
  }],
};

describe("geographic grid helpers", () => {
  it("finds the containing cell", () => {
    expect(coordinateToCell(77.64, 12.91, cells)?.properties.id).toBe("hsr-grid-test");
  });

  it("returns null outside the analysis grid", () => {
    expect(coordinateToCell(77.7, 12.91, cells)).toBeNull();
  });

  it("round-trips WGS84 through projected metres", () => {
    const projected = lonLatToMercator(77.6389, 12.9116);
    const coordinate = mercatorToLonLat(projected.x, projected.y);
    expect(coordinate.longitude).toBeCloseTo(77.6389, 7);
    expect(coordinate.latitude).toBeCloseTo(12.9116, 7);
  });

  it("calculates local distances in metres", () => {
    const distance = haversineDistanceMeters(
      { latitude: 12.9116, longitude: 77.6389 },
      { latitude: 12.9125, longitude: 77.6389 },
    );
    expect(distance).toBeGreaterThan(95);
    expect(distance).toBeLessThan(105);
  });
});
