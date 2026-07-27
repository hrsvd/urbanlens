import type { MetricKey } from "./types";

// ── Locality registry ─────────────────────────────────────────────────────────
// Each entry must have a real OSM boundary relation that produces a valid
// polygon when fetched via the OSM API (relation/{id}/full.json).
// Center coordinates are approximate geographic centroids used to focus the
// 3D camera on initial load and to pick the "regional" cell for shared signals.
//
// OSM relation IDs were verified against Nominatim and Overpass on 2026-07-27.
// BBMP ward numbers are included where available for static-intelligence files.

export type LocalityId =
  | "hsr"
  | "koramangala"
  | "indiranagar"
  | "whitefield"
  | "jpnagar"
  | "marathahalli"
  | "bellandur"
  | "hebbal";

export type LocalityConfig = {
  id: LocalityId;
  displayName: string;
  osmRelationId: number;
  center: { latitude: number; longitude: number };
  description: string;
};

export const LOCALITIES: Record<LocalityId, LocalityConfig> = {
  hsr: {
    id: "hsr",
    displayName: "HSR Layout",
    osmRelationId: 17168010,
    center: { latitude: 12.9137, longitude: 77.64235 },
    description: "South Bengaluru IT and residential hub, Outer Ring Road corridor",
  },
  koramangala: {
    id: "koramangala",
    displayName: "Koramangala",
    osmRelationId: 19884595,
    center: { latitude: 12.9352, longitude: 77.6245 },
    description: "Central Bengaluru tech, startup, and lifestyle hub",
  },
  indiranagar: {
    id: "indiranagar",
    displayName: "Indiranagar",
    osmRelationId: 19883335,
    center: { latitude: 12.9784, longitude: 77.6408 },
    description: "North-central Bengaluru, Metro-connected, upmarket residential",
  },
  whitefield: {
    id: "whitefield",
    displayName: "Whitefield",
    osmRelationId: 19883364,
    center: { latitude: 12.9698, longitude: 77.7499 },
    description: "Major eastern IT corridor — ITPL, EPIP Zone, and residential townships",
  },
  jpnagar: {
    id: "jpnagar",
    displayName: "JP Nagar",
    osmRelationId: 17205864,
    center: { latitude: 12.9010, longitude: 77.5845 },
    description: "Established south Bengaluru residential locality, good civic infrastructure",
  },
  marathahalli: {
    id: "marathahalli",
    displayName: "Marathahalli",
    osmRelationId: 19884550,
    center: { latitude: 12.9591, longitude: 77.7005 },
    description: "Eastern Outer Ring Road corridor, mid-range residential and retail",
  },
  bellandur: {
    id: "bellandur",
    displayName: "Bellandur",
    osmRelationId: 19884585,
    center: { latitude: 12.9263, longitude: 77.6783 },
    description: "Growing IT and residential area on the Outer Ring Road, near Sarjapur Road",
  },
  hebbal: {
    id: "hebbal",
    displayName: "Hebbal",
    osmRelationId: 19883365,
    center: { latitude: 13.0437, longitude: 77.5969 },
    description: "North Bengaluru flyover corridor, near Manyata Tech Park and Kempegowda airport approach",
  },
};

export const DEFAULT_LOCALITY_ID: LocalityId = "hsr";

// Derive locality from a cell ID (format: "{localityId}-grid-{row}-{col}").
// Returns null if the prefix doesn't match any registered locality.
export function localityFromCellId(cellId: string): LocalityId | null {
  const prefix = cellId.split("-grid-")[0] as LocalityId;
  return prefix in LOCALITIES ? prefix : null;
}

// ── Legacy single-locality constants (kept for backward compatibility) ────────
export const HSR_CENTER = LOCALITIES.hsr.center;
export const HSR_BOUNDARY_RELATION_ID = LOCALITIES.hsr.osmRelationId;
export const GRID_SIZE_METERS = 100;
export const CELL_OVERLAY_OPACITY = 0.48;

// Weights for scored metrics only — sum to 1.0.
//
// Metrics removed from scoring (shown as context-only in the panel):
//   safetyProxy    — police proximity has no demonstrated crime-rate correlation;
//                    confidence 0.30 is below the threshold for scoring.
//   drainProximity — the signal is directionally ambiguous (infrastructure vs. risk);
//                    it contributes to floodSusceptibility as an input instead.
//   estimatedNoise — no measurement data; road-proximity proxy confidence is 0.45,
//                    too low to contribute to a housing decision score.
//
// Remaining weights scaled proportionally so they continue to sum to 1.0.
export const DEFAULT_WEIGHTS = {
  floodSusceptibility: 0.19,
  airQuality: 0.17,
  healthcare: 0.12,
  transit: 0.11,
  connectivity: 0.10,
  education: 0.10,
  dailyNeeds: 0.08,
  greenSpace: 0.08,
  rainfall: 0.05,
} as const;

// Labels for the heatmap layer selector and score breakdown.
// Only keys present in DEFAULT_WEIGHTS plus "overall" belong here.
export const METRIC_LABELS: Record<MetricKey, string> = {
  overall: "Overall intelligence",
  airQuality: "Air quality",
  floodSusceptibility: "Flood susceptibility",
  rainfall: "Rainfall context",
  connectivity: "Local walkability",
  education: "Schools access",
  healthcare: "Healthcare access",
  transit: "Public transport",
  dailyNeeds: "Daily-needs retail",
  greenSpace: "Parks & green space",
};

export const SOURCE_URLS = {
  osm: "https://www.openstreetmap.org/copyright",
  openMeteo: "https://open-meteo.com/en/docs",
  openMeteoAir: "https://open-meteo.com/en/docs/air-quality-api",
  openCityFlood: "https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban",
  openCityDrains: "https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps",
  cpcb: "https://airquality.cpcb.gov.in/",
  dataGovIn: "https://data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69",
  kerc: "https://kerc.karnataka.gov.in/english/publications.php",
  bescom: "https://bescom.karnataka.gov.in/",
  bwssb: "https://bwssb.gov.in/",
  bmtc: "https://www.bmtcinfo.com/",
  bmrcl: "https://www.bmrcl.co.in/",
  bbmp: "https://www.bbmp.gov.in/",
  bbmpSahaaya: "https://bbmpsahaaya.karnataka.gov.in/",
  ncrb: "https://ncrb.gov.in/",
  trai: "https://www.trai.gov.in/",
  copernicus: "https://dataspace.copernicus.eu/",
  usgsEarthExplorer: "https://earthexplorer.usgs.gov/",
  osrm: "https://project-osrm.org/",
};
