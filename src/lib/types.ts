import type { Feature, FeatureCollection, LineString, MultiLineString, Point, Polygon } from "geojson";

export type RiskLevel = "low" | "moderate" | "high" | "unknown";
export type MetricStatus = "good" | "moderate" | "poor" | "unknown";

export type MetricEvidence = {
  sourceName: string;
  sourceUrl?: string;
  sourceType: "official" | "open-data" | "modelled" | "crowdsourced" | "derived";
  geographicResolution: string;
  collectedAt?: string;
  updatedAt?: string;
};

export type CellMetric = {
  key: string;
  label: string;
  score: number | null;
  ratingOutOf10: number | null;
  status: MetricStatus;
  value?: number | string | null;
  unit?: string;
  explanation: string;
  confidence: number;
  evidence: MetricEvidence[];
};

// Metric category keys — used for grouping metrics in the UI.
export type MetricCategoryKey =
  | "environment"
  | "connectivity"
  | "education"
  | "healthcare"
  | "dailyLife"
  | "utilities"
  | "civic";

// A category groups related metrics and carries a rolled-up score.
// The score is the weighted average of scored sub-metrics within the category.
// categories with only context-only metrics have score: null.
export type MetricCategory = {
  key: MetricCategoryKey;
  label: string;
  icon: string; // lucide icon name
  description: string;
  score: number | null;
  confidence: number;
  riskLevel: RiskLevel;
  metrics: CellMetric[];
};

// Scored metrics: contribute to the overall score via DEFAULT_WEIGHTS.
// Context metrics (below): always shown in the panel; never scored.
export type CellMetrics = {
  // --- Scored ---
  airQuality: CellMetric;
  floodSusceptibility: CellMetric;
  rainfall: CellMetric;
  connectivity: CellMetric;
  education: CellMetric;
  healthcare: CellMetric;
  transit: CellMetric;
  dailyNeeds: CellMetric;
  greenSpace: CellMetric;
  // --- Context-only (ratingOutOf10 is always null) ---
  drainProximity: CellMetric;       // Informative layer input; ambiguous signal
  roadProximity: CellMetric;        // Renamed from estimatedNoise; road-distance fact
  policeProximity: CellMetric;      // Renamed from safetyProxy; distance fact, no crime inference
  electricityContext?: CellMetric;  // KERC zone-level SAIDI; locality-level only
  networkQuality?: CellMetric;
  constructionProximity?: CellMetric;
  nearbyAmenities?: CellMetric;
  // --- New context metrics ---
  transitFrequency?: CellMetric;    // BMTC route count and frequency context
  commuteContext?: CellMetric;      // OSRM-based commute destinations
  heatIslandContext?: CellMetric;   // Landsat LST urban heat island
  ndviGreenCover?: CellMetric;      // Sentinel-2 NDVI satellite green cover
  waterSupplyContext?: CellMetric;  // BWSSB zone-level supply context
  civicComplaints?: CellMetric;     // BBMP Sahaaya ward complaint patterns
  crimeContext?: CellMetric;        // NCRB city-level context (no locality score)
};

export type StaticCellFeatures = {
  elevationMeters: number | null;
  relativeElevationMeters: number | null;
  localSlopeDegrees: number | null;
  distanceToDrainMeters: number | null;
  distanceToFloodPointMeters: number | null;
  distanceToLakeMeters: number | null;
  distanceToMajorRoadMeters: number | null;
  roadLengthMeters: number;
  amenityCount: number;
  commercialCount: number;
  busStopCount: number;
  constructionCount: number;
  buildingCount: number;
  // Livability access features (derived from OpenStreetMap during ingestion).
  // Optional so older artifacts and test fixtures without them stay valid;
  // an absent field is treated as "unavailable", never as zero.
  distanceToSchoolMeters?: number | null;
  schoolCount?: number;
  distanceToHealthcareMeters?: number | null;
  healthcareCount?: number;
  distanceToTransitMeters?: number | null;
  distanceToMetroStationMeters?: number | null;
  transitStopCount?: number;
  distanceToMarketMeters?: number | null;
  dailyNeedsCount?: number;
  distanceToParkMeters?: number | null;
  parkCount?: number;
  distanceToPoliceMeters?: number | null;
};

export type AnalysisCellProperties = {
  id: string;
  row: number;
  column: number;
  sizeMeters: number;
  centerLatitude: number;
  centerLongitude: number;
  staticFeatures: StaticCellFeatures;
  staticScores: {
    drainProximity: number | null;
    estimatedNoise: number | null;
    connectivity: number | null;
    floodBaseline: number | null;
    education?: number | null;
    healthcare?: number | null;
    transit?: number | null;
    dailyNeeds?: number | null;
    greenSpace?: number | null;
    safetyProxy?: number | null;
  };
};

export type AnalysisCellFeature = Feature<Polygon, AnalysisCellProperties>;

export type CommuteDestination = {
  name: string;
  category: string;
  approxDistanceKm: number;
  osmRoutingOffPeakMin?: { from: number; to: number };
  peakMultiplier?: string;
  routedDriveMinutes?: number | null; // populated by OSRM at runtime if available
};

export type AnalysisCell = {
  id: string;
  bounds: Polygon;
  center: { latitude: number; longitude: number };
  sizeMeters: number;
  metrics: CellMetrics;
  categories: MetricCategory[];    // grouped view for UI hierarchy
  overallScore: number | null;
  riskLevel: RiskLevel;
  confidence: number;
  updatedAt: string;
  // Prominent flood alert when susceptibility score < 3.5 (high risk signal).
  // Shown regardless of the overall score so it cannot be averaged away.
  floodAlert?: boolean;
};

export type MapFeatureProperties = {
  id: string;
  name?: string;
  kind?: string;
  class?: string;
  height?: number;
  levels?: number;
  source?: string;
  [key: string]: unknown;
};

export type SearchItem = {
  id: string;
  name: string;
  kind: string;
  longitude: number;
  latitude: number;
  localityId?: string;          // which locality this result belongs to
  localityName?: string;        // display name for the locality label in results
  matchedTokens?: number;
  matchScore?: number;
  note?: string;
  addressMatch?: boolean;       // true when result came from OSM addr:* tag, not name/brand
};

export type MapBootstrap = {
  meta: {
    generatedAt: string;
    gridSizeMeters: number;
    boundarySource: string;
    boundaryRelationId: number;
    localityId: string;           // which locality this bootstrap covers
    osmAttribution: string;
    counts: Record<string, number>;
  };
  boundary: Feature<Polygon, { name: string; source: string }>;
  buildings: FeatureCollection<Polygon, MapFeatureProperties>;
  roads: FeatureCollection<LineString | MultiLineString, MapFeatureProperties>;
  water: FeatureCollection<Polygon | LineString | MultiLineString, MapFeatureProperties>;
  green: FeatureCollection<Polygon, MapFeatureProperties>;
  drains: FeatureCollection<LineString | MultiLineString, MapFeatureProperties>;
  floodPoints: FeatureCollection<Point, MapFeatureProperties>;
  pois: FeatureCollection<Point, MapFeatureProperties>;
  grid: FeatureCollection<Polygon, AnalysisCellProperties>;
  searchIndex: SearchItem[];
};

// Keys available in the heatmap layer selector and score breakdown table.
// Only scored metrics plus "overall" — context-only metrics are excluded.
export type MetricKey =
  | "overall"
  | "airQuality"
  | "floodSusceptibility"
  | "rainfall"
  | "connectivity"
  | "education"
  | "healthcare"
  | "transit"
  | "dailyNeeds"
  | "greenSpace";

// Static intelligence shape loaded from public/data/{localityId}-static-intelligence.json.
// Fields that were previously HSR-specific are now generalized. The _meta.locality
// string carries the display name; numeric NDVI/UHI fields use generic keys.
export type StaticIntelligence = {
  _meta: { locality: string; bbmpWard: number | null; generatedAt: string };
  transit: {
    bmtc: {
      routeCount: number;
      majorRoutes: Array<{ route: string; description: string }>;
      peakHeadwayMinutes: { min: number; max: number; description: string };
      offPeakHeadwayMinutes: { min: number; max: number };
      _confidence: number;
      _dataVintage: string;
      sourceUrl: string;
      _limitations: string;
    };
    nammaMetro: {
      line: string;
      // Renamed from stationsNearHsr → nearbyStations for locality-agnostic use.
      nearbyStations: Array<{
        name: string;
        approximateDistanceKm: number;
        status: string;
      }>;
      // Legacy alias kept so existing HSR intelligence file still deserialises.
      stationsNearHsr?: Array<{
        name: string;
        approximateDistanceFromHsrCenterKm: number;
        status: string;
      }>;
      _confidence: number;
      sourceUrl: string;
      _dataVintage?: string;
    };
    commuteDestinations: {
      destinations: Array<{
        name: string;
        category: string;
        approxDistanceKm: number;
        osmRoutingOffPeakMin: { from: number; to: number };
        peakMultiplier: string;
        latitude: number;
        longitude: number;
      }>;
      _confidence: number;
      _limitations: string;
    };
  };
  utilities: {
    water: { authority: string; primaryWaterSource: string; supplyFrequency: string; _confidence: number; sourceUrl: string; notes: string; _limitations: string };
    electricity: { saidi2023Hours: number; saifi2023Count: number; kercSourceUrl: string; reportYear: string; _confidence: number; _limitations: string };
  };
  environment: {
    ndvi: {
      // Generic field names — HSR file used 'hsrLayoutMeanNdvi'; new files use 'localityMeanNdvi'.
      // Both are accepted; localityMeanNdvi takes precedence.
      localityMeanNdvi?: number;
      hsrLayoutMeanNdvi?: number;   // legacy alias for HSR bootstrap compat
      greenCoverPercent: number;
      ndviClassification: string;
      _confidence: number;
      _dataVintage: string;
      sourceUrl: string;
      _limitations: string;
    };
    heatIsland: { uhiIntensityCelsius: number; uhiClassification: string; meanLstCelsius?: number; meanLstHsrCelsius?: number; _confidence: number; _dataVintage: string; sourceUrl: string; _limitations: string };
  };
  civic: {
    ward: { bbmpWardNumber: number | null; bbmpWardName: string; areaHectares: number; population2011Census: number; sourceUrl: string; _confidence: number };
    complaints: {
      totalComplaintsPerYear: { approx: number; note: string };
      topCategories: Array<{ rank: number; category: string; relativeFrequency: string; note: string; sources: string[] }>;
      _confidence: number;
      _limitations: string;
      dataVintage: string;
      sourceUrls: string[];
    };
    crime: { _confidence: number; dataLevel: string; localityNote: string; hsrLayoutNote?: string; sourceUrls: string[] };
    internet: { fiberAvailability: string; confirmedIsps: Array<{ name: string; technology: string }>; bengaluruMedianDownloadMbps: number; _confidence: number; _limitations: string };
  };
};

export type LayerVisibility = {
  buildings: boolean;
  labels: boolean;
  roads: boolean;
  drains: boolean;
  floodPoints: boolean;
  grid: boolean;
  heatmap: boolean;
};

export type NetworkMeasurement = {
  cellId: string;
  localityId: string;
  operator: string;
  networkType: "4G" | "5G" | "WiFi";
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs?: number;
  packetLossPercent?: number;
  indoor?: boolean;
  measuredAt: string;
};
