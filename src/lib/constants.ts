import type { MetricKey } from "./types";

export const HSR_CENTER = { latitude: 12.9137, longitude: 77.64235 };
export const HSR_BOUNDARY_RELATION_ID = 17168010;
export const GRID_SIZE_METERS = 100;
export const CELL_OVERLAY_OPACITY = 0.22;

export const DEFAULT_WEIGHTS = {
  airQuality: 0.25,
  floodSusceptibility: 0.3,
  drainProximity: 0.15,
  rainfall: 0.1,
  estimatedNoise: 0.1,
  connectivity: 0.1,
} as const;

export const METRIC_LABELS: Record<MetricKey, string> = {
  overall: "Overall intelligence",
  airQuality: "Air quality",
  floodSusceptibility: "Flood susceptibility",
  drainProximity: "Drain context",
  rainfall: "Rainfall",
  estimatedNoise: "Estimated noise",
  connectivity: "Connectivity",
};

export const SOURCE_URLS = {
  osm: "https://www.openstreetmap.org/copyright",
  openMeteo: "https://open-meteo.com/en/docs",
  openMeteoAir: "https://open-meteo.com/en/docs/air-quality-api",
  openCityFlood: "https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban",
  openCityDrains: "https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps",
};
