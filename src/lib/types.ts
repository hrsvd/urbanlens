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

export type CellMetrics = {
  airQuality: CellMetric;
  floodSusceptibility: CellMetric;
  drainProximity: CellMetric;
  rainfall: CellMetric;
  estimatedNoise: CellMetric;
  connectivity: CellMetric;
  networkQuality?: CellMetric;
  constructionProximity?: CellMetric;
  nearbyAmenities?: CellMetric;
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
  };
};

export type AnalysisCellFeature = Feature<Polygon, AnalysisCellProperties>;

export type AnalysisCell = {
  id: string;
  bounds: Polygon;
  center: { latitude: number; longitude: number };
  sizeMeters: number;
  metrics: CellMetrics;
  overallScore: number | null;
  riskLevel: RiskLevel;
  confidence: number;
  updatedAt: string;
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
};

export type MapBootstrap = {
  meta: {
    generatedAt: string;
    gridSizeMeters: number;
    boundarySource: string;
    boundaryRelationId: number;
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

export type MetricKey =
  | "overall"
  | "airQuality"
  | "floodSusceptibility"
  | "drainProximity"
  | "rainfall"
  | "estimatedNoise"
  | "connectivity";

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
