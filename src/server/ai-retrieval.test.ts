import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyIntent, assembleContext } from "./ai-retrieval";
import type { MapBootstrap, StaticIntelligence } from "@/lib/types";

// ── classifyIntent ─────────────────────────────────────────────────────────────

describe("classifyIntent", () => {
  it("returns broad for a generic question", () => {
    expect(classifyIntent("Which locality has the best air quality?")).toEqual({ kind: "broad" });
  });

  it("identifies HSR Layout", () => {
    const result = classifyIntent("What is the flood risk in HSR Layout?");
    expect(result).toEqual({ kind: "specific-locality", localityId: "hsr" });
  });

  it("identifies Koramangala", () => {
    const result = classifyIntent("Is Koramangala well connected?");
    expect(result).toEqual({ kind: "specific-locality", localityId: "koramangala" });
  });

  it("identifies Whitefield via ITPL token", () => {
    const result = classifyIntent("How far is ITPL from Whitefield?");
    expect(result).toEqual({ kind: "specific-locality", localityId: "whitefield" });
  });

  it("returns address intent when query has street/road tokens", () => {
    const result = classifyIntent("27th Main Road, HSR Layout sector 2");
    expect(result.kind).toBe("address");
    if (result.kind === "address") expect(result.localityId).toBe("hsr");
  });

  it("returns address intent for a flat number", () => {
    const result = classifyIntent("Flat 403, Manyata Tech Park, Hebbal");
    expect(result.kind).toBe("address");
    if (result.kind === "address") expect(result.localityId).toBe("hebbal");
  });

  it("returns broad for a comparison question without locality names", () => {
    const result = classifyIntent("Compare public transport options in Bengaluru");
    expect(result).toEqual({ kind: "broad" });
  });

  it("handles case-insensitive locality matching", () => {
    const result = classifyIntent("tell me about INDIRANAGAR");
    expect(result).toEqual({ kind: "specific-locality", localityId: "indiranagar" });
  });
});

// ── assembleContext ────────────────────────────────────────────────────────────
// These tests mock getBootstrap and getStaticIntelligence from data.ts so
// they don't hit the file system.

vi.mock("./data", () => ({
  getBootstrap: vi.fn(),
  getStaticIntelligence: vi.fn(),
}));

import { getBootstrap, getStaticIntelligence } from "./data";

const mockBootstrap = (localityId: string, cellCount = 4): MapBootstrap => ({
  meta: {
    generatedAt: "2026-01-01T00:00:00Z",
    gridSizeMeters: 100,
    boundarySource: "osm",
    boundaryRelationId: 1,
    localityId,
    osmAttribution: "© OpenStreetMap",
    counts: {},
  },
  boundary: { type: "Feature", properties: { name: localityId, source: "osm" }, geometry: { type: "Polygon", coordinates: [[]] } },
  buildings: { type: "FeatureCollection", features: [] },
  roads: { type: "FeatureCollection", features: [] },
  water: { type: "FeatureCollection", features: [] },
  green: { type: "FeatureCollection", features: [] },
  drains: { type: "FeatureCollection", features: [] },
  floodPoints: { type: "FeatureCollection", features: [] },
  pois: { type: "FeatureCollection", features: [] },
  grid: {
    type: "FeatureCollection",
    features: Array.from({ length: cellCount }, (_, i) => ({
      type: "Feature" as const,
      properties: {
        id: `${localityId}-grid-0${i}-00`,
        row: i,
        column: 0,
        sizeMeters: 100,
        centerLatitude: 12.9 + i * 0.001,
        centerLongitude: 77.6,
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
      },
      geometry: { type: "Polygon" as const, coordinates: [[]] },
    })),
  },
  searchIndex: [
    {
      id: `${localityId}-poi-1`,
      name: "27th Main Road",
      kind: "road",
      latitude: 12.91,
      longitude: 77.64,
      localityId,
      addressMatch: true,
    },
  ],
});

const mockIntelligence: StaticIntelligence = {
  _meta: { locality: "Test Locality", bbmpWard: null, generatedAt: "2026-01-01T00:00:00Z" },
  transit: {
    bmtc: {
      routeCount: 12,
      majorRoutes: [],
      peakHeadwayMinutes: { min: 10, max: 30, description: "test" },
      offPeakHeadwayMinutes: { min: 15, max: 45 },
      _confidence: 0.8,
      _dataVintage: "2025",
      sourceUrl: "https://bmtcinfo.com",
      _limitations: "",
    },
    nammaMetro: {
      line: "Green",
      nearbyStations: [{ name: "Test Station", approximateDistanceKm: 1.2, status: "operational" }],
      _confidence: 0.9,
      sourceUrl: "https://bmrcl.co.in",
    },
    commuteDestinations: {
      destinations: [],
      _confidence: 0.7,
      _limitations: "",
    },
  },
  utilities: {
    water: { authority: "BWSSB", primaryWaterSource: "Cauvery", supplyFrequency: "daily", _confidence: 0.8, sourceUrl: "", notes: "", _limitations: "" },
    electricity: { saidi2023Hours: 8, saifi2023Count: 4, kercSourceUrl: "", reportYear: "2023", _confidence: 0.7, _limitations: "" },
  },
  environment: {
    ndvi: { greenCoverPercent: 28, ndviClassification: "Moderate", _confidence: 0.8, _dataVintage: "2024", sourceUrl: "", _limitations: "" },
    heatIsland: { uhiIntensityCelsius: 1.8, uhiClassification: "Moderate", _confidence: 0.7, _dataVintage: "2024", sourceUrl: "", _limitations: "" },
  },
  civic: {
    ward: { bbmpWardNumber: 150, bbmpWardName: "Test Ward", areaHectares: 400, population2011Census: 35000, sourceUrl: "", _confidence: 0.8 },
    complaints: {
      totalComplaintsPerYear: { approx: 500, note: "" },
      topCategories: [{ rank: 1, category: "Roads", relativeFrequency: "high", note: "", sources: [] }],
      _confidence: 0.7,
      _limitations: "",
      dataVintage: "2024",
      sourceUrls: [],
    },
    crime: { _confidence: 0.5, dataLevel: "city", localityNote: "City-wide data only", sourceUrls: [] },
    internet: { fiberAvailability: "high", confirmedIsps: [], bengaluruMedianDownloadMbps: 50, _confidence: 0.7, _limitations: "" },
  },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("assembleContext", () => {
  it("fetches only the single locality for a locality-specific query", async () => {
    vi.mocked(getBootstrap).mockResolvedValue(mockBootstrap("hsr"));
    vi.mocked(getStaticIntelligence).mockResolvedValue(mockIntelligence);

    const ctx = await assembleContext("What is the flood risk in HSR Layout?");
    expect(ctx.intent).toEqual({ kind: "specific-locality", localityId: "hsr" });
    expect(ctx.localities).toHaveLength(1);
    expect(ctx.localities[0].localityId).toBe("hsr");
    expect(ctx.addressMatch).toBeNull();
  });

  it("includes intelligence summary in rollup when available", async () => {
    vi.mocked(getBootstrap).mockResolvedValue(mockBootstrap("hsr"));
    vi.mocked(getStaticIntelligence).mockResolvedValue(mockIntelligence);

    const ctx = await assembleContext("Tell me about HSR");
    const intel = ctx.localities[0].intelligence;
    expect(intel).not.toBeNull();
    expect(intel?.transit.bmtcRouteCount).toBe(12);
    expect(intel?.environment.greenCoverPercent).toBe(28);
    expect(intel?.utilities.waterAuthority).toBe("BWSSB");
    expect(intel?.civic.wardName).toBe("Test Ward");
  });

  it("handles null intelligence gracefully", async () => {
    vi.mocked(getBootstrap).mockResolvedValue(mockBootstrap("hsr"));
    vi.mocked(getStaticIntelligence).mockResolvedValue(null);

    const ctx = await assembleContext("Tell me about HSR");
    expect(ctx.localities[0].intelligence).toBeNull();
  });

  it("includes all 8 localities for a broad query", async () => {
    vi.mocked(getBootstrap).mockImplementation((id) =>
      Promise.resolve(mockBootstrap(id ?? "hsr")),
    );
    vi.mocked(getStaticIntelligence).mockResolvedValue(null);

    const ctx = await assembleContext("Which locality has the best green cover?");
    expect(ctx.intent).toEqual({ kind: "broad" });
    expect(ctx.localities).toHaveLength(8);
  });

  it("skips failing localities in broad mode rather than crashing", async () => {
    vi.mocked(getBootstrap).mockImplementation((id) => {
      if (id === "whitefield") return Promise.reject(new Error("file not found"));
      return Promise.resolve(mockBootstrap(id ?? "hsr"));
    });
    vi.mocked(getStaticIntelligence).mockResolvedValue(null);

    const ctx = await assembleContext("Compare air quality");
    expect(ctx.localities.length).toBe(7);
    expect(ctx.localities.find((l) => l.localityId === "whitefield")).toBeUndefined();
  });

  it("populates systemPrompt and userTurn with query text", async () => {
    vi.mocked(getBootstrap).mockResolvedValue(mockBootstrap("hsr"));
    vi.mocked(getStaticIntelligence).mockResolvedValue(null);

    const ctx = await assembleContext("Is HSR prone to flooding?");
    expect(ctx.systemPrompt).toContain("UrbanLens");
    expect(ctx.systemPrompt).toContain("STRICT RULES");
    expect(ctx.userTurn).toContain("Is HSR prone to flooding?");
    expect(ctx.userTurn).toContain("LOCALITY DATA");
  });

  it("sets cellCount from bootstrap grid feature count", async () => {
    vi.mocked(getBootstrap).mockResolvedValue(mockBootstrap("hsr", 7));
    vi.mocked(getStaticIntelligence).mockResolvedValue(null);

    const ctx = await assembleContext("Tell me about HSR");
    expect(ctx.localities[0].cellCount).toBe(7);
  });
});
