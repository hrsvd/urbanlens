import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { AnalysisCellProperties } from "./types";

const EARTH_RADIUS = 6_378_137;

export function lonLatToMercator(longitude: number, latitude: number) {
  return {
    x: EARTH_RADIUS * longitude * Math.PI / 180,
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)),
  };
}

export function mercatorToLonLat(x: number, y: number) {
  return {
    longitude: x / EARTH_RADIUS * 180 / Math.PI,
    latitude: (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI,
  };
}

export function coordinateToCell(
  longitude: number,
  latitude: number,
  cells: FeatureCollection<Polygon, AnalysisCellProperties>,
): Feature<Polygon, AnalysisCellProperties> | null {
  const target = point([longitude, latitude]);
  return cells.features.find((cell) => booleanPointInPolygon(target, cell)) ?? null;
}

export function haversineDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const phi1 = from.latitude * Math.PI / 180;
  const phi2 = to.latitude * Math.PI / 180;
  const deltaPhi = (to.latitude - from.latitude) * Math.PI / 180;
  const deltaLambda = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
