import "server-only";

import { SOURCE_URLS } from "@/lib/constants";
import {
  airQualityScore,
  calculateOverallScore,
  rainfallScore,
  riskFromScore,
  scoreFloodSusceptibility,
  statusFromScore,
} from "@/lib/scoring";
import type {
  AnalysisCell,
  AnalysisCellFeature,
  CellMetric,
  CellMetrics,
  MetricCategory,
  MetricCategoryKey,
  MetricEvidence,
  StaticIntelligence,
} from "@/lib/types";
import { DEFAULT_WEIGHTS } from "@/lib/constants";
import type { AirQualityResult, WeatherResult } from "./external";
import { fetchOsrmRoute } from "./external";

const round = (value: number, decimals = 1) => Number(value.toFixed(decimals));

function unavailableMetric(key: string, label: string, explanation: string): CellMetric {
  return {
    key,
    label,
    score: null,
    ratingOutOf10: null,
    status: "unknown",
    value: null,
    explanation,
    confidence: 0,
    evidence: [],
  };
}

function contextMetric(
  key: string,
  label: string,
  value: number | string | null,
  unit: string,
  explanation: string,
  confidence: number,
  evidence: MetricEvidence[],
): CellMetric {
  return {
    key,
    label,
    score: null,
    ratingOutOf10: null,
    status: "unknown",
    value,
    unit,
    explanation,
    confidence,
    evidence,
  };
}

function derivedEvidence(
  sourceName: string,
  geographicResolution: string,
  updatedAt: string,
  sourceUrl = SOURCE_URLS.osm,
): MetricEvidence {
  return {
    sourceName,
    sourceUrl,
    sourceType: "derived",
    geographicResolution,
    updatedAt,
  };
}

// KERC Annual Performance Review 2023-24 — zone-level electricity reliability
// for BESCOM (Bengaluru Electric Supply Company), Bengaluru South zone.
const KERC_BESCOM_DATA = {
  saidiHoursPerYear: 47.6,
  saifiCountPerYear: 38.2,
  zone: "Bengaluru South (BESCOM)",
  reportYear: "2023-24",
  sourceUrl: SOURCE_URLS.kerc,
  updatedAt: "2024-06-30",
};

const CATEGORY_DEFINITIONS: Record<MetricCategoryKey, {
  label: string;
  icon: string;
  description: string;
  metricKeys: string[];
}> = {
  environment: {
    label: "Environment",
    icon: "Leaf",
    description: "Air quality, flood susceptibility, rainfall, green cover, and heat island context",
    metricKeys: ["airQuality", "floodSusceptibility", "rainfall", "ndviGreenCover", "heatIslandContext"],
  },
  connectivity: {
    label: "Connectivity & Transport",
    icon: "Train",
    description: "Public transport access, transit frequency, walkability, and commute context",
    metricKeys: ["transit", "transitFrequency", "connectivity", "commuteContext"],
  },
  education: {
    label: "Education",
    icon: "GraduationCap",
    description: "Proximity and density of schools, colleges, and universities",
    metricKeys: ["education"],
  },
  healthcare: {
    label: "Healthcare",
    icon: "Heart",
    description: "Proximity and density of hospitals, clinics, doctors, and pharmacies",
    metricKeys: ["healthcare"],
  },
  dailyLife: {
    label: "Daily Life",
    icon: "ShoppingBag",
    description: "Daily-needs retail access and green space proximity",
    metricKeys: ["dailyNeeds", "greenSpace"],
  },
  utilities: {
    label: "Utilities",
    icon: "Zap",
    description: "Electricity reliability, water supply context, and internet connectivity",
    metricKeys: ["electricityContext", "waterSupplyContext", "networkQuality"],
  },
  civic: {
    label: "Civic & Safety",
    icon: "Shield",
    description: "Ward-level complaint patterns, drain proximity, road context, and police proximity",
    metricKeys: ["civicComplaints", "drainProximity", "roadProximity", "policeProximity", "crimeContext", "constructionProximity"],
  },
};

function buildCategories(metrics: CellMetrics): MetricCategory[] {
  const allMetrics: Record<string, CellMetric> = metrics as unknown as Record<string, CellMetric>;
  const weights = DEFAULT_WEIGHTS as Record<string, number>;

  return (Object.entries(CATEGORY_DEFINITIONS) as [MetricCategoryKey, typeof CATEGORY_DEFINITIONS[MetricCategoryKey]][])
    .map(([key, def]) => {
      const categoryMetrics = def.metricKeys
        .map((mk) => allMetrics[mk])
        .filter(Boolean);

      const scored = categoryMetrics.filter(
        (m) => m.ratingOutOf10 !== null && weights[m.key] !== undefined,
      );

      let score: number | null = null;
      let confidence = 0;

      if (scored.length > 0) {
        const totalWeight = scored.reduce((sum, m) => sum + (weights[m.key] ?? 0), 0) || 1;
        score = Number(
          (scored.reduce((sum, m) => sum + (m.ratingOutOf10 ?? 0) * ((weights[m.key] ?? 0) / totalWeight), 0)).toFixed(1),
        );
        confidence = scored.reduce((sum, m) => sum + m.confidence * ((weights[m.key] ?? 0) / totalWeight), 0);
        confidence = Number(confidence.toFixed(2));
      } else {
        const contextWithConf = categoryMetrics.filter((m) => m.confidence > 0);
        if (contextWithConf.length > 0) {
          confidence = Number((contextWithConf.reduce((sum, m) => sum + m.confidence, 0) / contextWithConf.length).toFixed(2));
        }
      }

      return {
        key,
        label: def.label,
        icon: def.icon,
        description: def.description,
        score,
        confidence,
        riskLevel: riskFromScore(score, confidence),
        metrics: categoryMetrics,
      };
    });
}

export async function buildCellMetrics(
  cell: AnalysisCellFeature,
  importedAt: string,
  air: AirQualityResult | null,
  weather: WeatherResult | null,
  intelligence: StaticIntelligence | null,
  cellLat: number,
  cellLon: number,
): Promise<AnalysisCell> {
  const staticFeatures = cell.properties.staticFeatures;
  const staticScores = cell.properties.staticScores;
  const localityName = intelligence?._meta?.locality ?? "this locality";
  const wardName = intelligence?.civic?.ward?.bbmpWardName ?? null;
  const wardNumber = intelligence?.civic?.ward?.bbmpWardNumber ?? null;
  const wardLabel = wardName
    ? wardNumber !== null ? `Ward ${wardNumber} (${wardName})` : wardName
    : "the local BBMP ward";

  // ── Air quality ──────────────────────────────────────────────────────────────
  const pm25 = air?.current.pm2_5 ?? null;
  const aqiScore = airQualityScore(pm25, air?.current.us_aqi ?? null);

  const airSourceConfidence = air?.sourceConfidence ?? 0.55;
  const airEvidenceEntry: MetricEvidence = air?.source === "cpcb"
    ? {
      sourceName: `CPCB/KSPCB real-time monitoring — ${air.cpcbStation ?? "Bengaluru"}`,
      sourceUrl: SOURCE_URLS.cpcb,
      sourceType: "official",
      geographicResolution: `Physical monitoring station, ~3–10 km from ${localityName}; single station reading`,
      collectedAt: air?.current.time,
      updatedAt: air?.fetchedAt,
    }
    : {
      sourceName: "Open-Meteo Air Quality (CAMS global forecast)",
      sourceUrl: SOURCE_URLS.openMeteoAir,
      sourceType: "modelled",
      geographicResolution: `Approximately 45 km global atmospheric-model grid; all ${localityName} cells share the same value`,
      collectedAt: air?.current.time,
      updatedAt: air?.fetchedAt,
    };

  const airQuality: CellMetric = aqiScore === null
    ? unavailableMetric(
      "airQuality",
      "Air quality",
      "The air-quality service is temporarily unavailable. No replacement value has been inferred.",
    )
    : {
      key: "airQuality",
      label: "Air quality",
      score: aqiScore,
      ratingOutOf10: aqiScore,
      status: statusFromScore(aqiScore),
      value: pm25,
      unit: "µg/m³ PM2.5",
      explanation: air?.source === "cpcb"
        ? `PM2.5 is ${pm25} µg/m³ from the ${air.cpcbStation ?? "nearest Bengaluru CPCB"} monitoring station. This is a real ambient-air reading, not a model estimate, but one station cannot capture street-level variation across ${localityName}.`
        : `Modelled outdoor PM2.5 is ${pm25} µg/m³ from the CAMS global atmospheric model (~45 km grid). All ${localityName} cells share the same value — this is regional context, not a hyperlocal or indoor reading.`,
      confidence: airSourceConfidence,
      evidence: [airEvidenceEntry],
    };

  // ── Rainfall ─────────────────────────────────────────────────────────────────
  const observedRain = weather?.observed24hMm ?? null;
  const forecastRain = weather?.forecast24hMm ?? null;
  const rainScore = rainfallScore(observedRain, forecastRain);
  const rainfall: CellMetric = rainScore === null
    ? unavailableMetric(
      "rainfall",
      "Rainfall context",
      "Weather-model rainfall is temporarily unavailable and is omitted from the score.",
    )
    : {
      key: "rainfall",
      label: "Rainfall context",
      score: rainScore,
      ratingOutOf10: rainScore,
      status: statusFromScore(rainScore),
      value: round((observedRain ?? 0) + (forecastRain ?? 0)),
      unit: "mm observed + forecast",
      explanation: `${round(observedRain ?? 0)} mm modelled over the previous 24 hours and ${round(forecastRain ?? 0)} mm forecast for the next 24 hours. Rainfall is temporary context, not permanent flood risk.`,
      confidence: 0.67,
      evidence: [{
        sourceName: "Open-Meteo Weather Forecast",
        sourceUrl: SOURCE_URLS.openMeteo,
        sourceType: "modelled",
        geographicResolution: "Provider-selected weather-model grid; not cell-level measurement",
        collectedAt: weather?.current?.time,
        updatedAt: weather?.fetchedAt,
      }],
    };

  // ── Flood susceptibility ─────────────────────────────────────────────────────
  const flood = scoreFloodSusceptibility({
    distanceToKnownFloodPointMeters: staticFeatures.distanceToFloodPointMeters,
    distanceToDrainMeters: staticFeatures.distanceToDrainMeters,
    distanceToLakeMeters: staticFeatures.distanceToLakeMeters,
    relativeElevationMeters: staticFeatures.relativeElevationMeters ?? null,
    localSlopeDegrees: staticFeatures.localSlopeDegrees ?? null,
    rainfallLast24HoursMm: observedRain,
    forecastRainfall24HoursMm: forecastRain,
  });
  const floodSusceptibility: CellMetric = flood.score === null
    ? unavailableMetric(
      "floodSusceptibility",
      "Flood susceptibility",
      "Mapped flood, drain, water, and weather evidence is insufficient for this cell.",
    )
    : {
      key: "floodSusceptibility",
      label: "Flood susceptibility",
      score: flood.score,
      ratingOutOf10: flood.score,
      status: statusFromScore(flood.score),
      value: flood.risk,
      unit: "/ 10 susceptibility",
      explanation: flood.explanation,
      confidence: flood.confidence,
      evidence: [
        {
          sourceName: "OpenCity / BBMP flood-vulnerable and low-lying locations",
          sourceUrl: SOURCE_URLS.openCityFlood,
          sourceType: "open-data",
          geographicResolution: `BBMP-reported flood locations for ${localityName}. Coverage is sparse — absence of a nearby point does not mean no flood risk exists.`,
          updatedAt: importedAt,
        },
        {
          sourceName: "BBMP stormwater-drain maps 2022 + OpenStreetMap waterways",
          sourceUrl: SOURCE_URLS.openCityDrains,
          sourceType: "open-data",
          geographicResolution: "Mapped line geometry; 2022 vintage, no capacity or maintenance data",
          updatedAt: importedAt,
        },
        ...(staticFeatures.elevationMeters !== null && staticFeatures.elevationMeters !== undefined ? [{
          sourceName: "Copernicus DEM GLO-90 via Open-Meteo Elevation API",
          sourceUrl: "https://open-meteo.com/en/docs/elevation-api",
          sourceType: "modelled" as const,
          geographicResolution: "90 m digital elevation model; cannot detect kerbs, basements, or micro-drains",
          updatedAt: importedAt,
        }] : []),
        ...(weather ? rainfall.evidence : []),
      ],
    };

  // ── NDVI green cover ─────────────────────────────────────────────────────────
  const ndviData = intelligence?.environment?.ndvi ?? null;
  // Accept both legacy (hsrLayoutMeanNdvi) and new (localityMeanNdvi) field names.
  const ndviMean = ndviData
    ? (ndviData.localityMeanNdvi ?? ndviData.hsrLayoutMeanNdvi ?? null)
    : null;
  const ndviGreenCover: CellMetric = ndviData === null || ndviMean === null
    ? unavailableMetric(
      "ndviGreenCover",
      "Satellite green cover (NDVI)",
      "Sentinel-2 NDVI data not available. Run data ingestion to populate.",
    )
    : contextMetric(
      "ndviGreenCover",
      "Satellite green cover (NDVI)",
      `${ndviMean.toFixed(2)} mean NDVI · ${ndviData.greenCoverPercent}% green cover`,
      "",
      `Sentinel-2 satellite analysis shows ${localityName} has a mean NDVI of ${ndviMean.toFixed(2)} (scale −1 to +1; urban vegetation typically 0.1–0.3). ${ndviData.greenCoverPercent}% of the locality polygon has NDVI > 0.25 (vegetated fraction). Classification: ${ndviData.ndviClassification}. Data vintage: ${ndviData._dataVintage}. ${ndviData._limitations}`,
      ndviData._confidence,
      [{
        sourceName: "Sentinel-2 MSI Level-2A — Copernicus Data Space Ecosystem",
        sourceUrl: ndviData.sourceUrl,
        sourceType: "open-data",
        geographicResolution: "10 m per pixel; locality polygon aggregate. Cell-level NDVI not yet computed.",
        updatedAt: ndviData._dataVintage,
      }],
    );

  // ── Heat island context ───────────────────────────────────────────────────────
  const uhiData = intelligence?.environment?.heatIsland ?? null;
  // Accept both field name variants.
  const meanLst = uhiData ? (uhiData.meanLstCelsius ?? uhiData.meanLstHsrCelsius ?? null) : null;
  const heatIslandContext: CellMetric = uhiData === null
    ? unavailableMetric(
      "heatIslandContext",
      "Urban heat island",
      "Landsat LST data not available. Run data ingestion to populate.",
    )
    : contextMetric(
      "heatIslandContext",
      "Urban heat island",
      `+${uhiData.uhiIntensityCelsius}°C above rural reference`,
      "",
      `Landsat 8 surface temperature analysis (${uhiData._dataVintage}) shows ${localityName} averages ${meanLst !== null ? `${meanLst}°C surface temperature, approximately ` : ""}${uhiData.uhiIntensityCelsius}°C above rural reference areas south of Bengaluru. Classification: ${uhiData.uhiClassification}. This is surface temperature, not air temperature; indoor temperatures depend on building type and ventilation. Seasonal variation is significant. ${uhiData._limitations}`,
      uhiData._confidence,
      [{
        sourceName: "Landsat 8 Collection 2 Level-2 Surface Temperature — USGS Earth Explorer",
        sourceUrl: uhiData.sourceUrl,
        sourceType: "open-data",
        geographicResolution: "30 m Landsat thermal band; locality-level aggregate, not per-cell",
        updatedAt: uhiData._dataVintage,
      }],
    );

  // ── Drain proximity ──────────────────────────────────────────────────────────
  const drainDist = staticFeatures.distanceToDrainMeters;
  const drainProximity: CellMetric = contextMetric(
    "drainProximity",
    "Drain network proximity",
    drainDist,
    drainDist !== null ? "m to nearest mapped drain" : "",
    drainDist !== null
      ? `The cell centre is ${Math.round(drainDist)} m from the nearest mapped stormwater-drain line. This distance is an input into the flood susceptibility model. It is not scored separately because proximity can indicate both drainage infrastructure and waterlogging exposure.`
      : "No mapped drain geometry was found near this cell. This reduces the flood model's data completeness.",
    0.66,
    [{
      sourceName: "OpenCity / BBMP stormwater-drain maps 2022 and OpenStreetMap",
      sourceUrl: SOURCE_URLS.openCityDrains,
      sourceType: "open-data",
      geographicResolution: "Nearest mapped line from the cell centre; 2022 KML + OSM waterways",
      updatedAt: importedAt,
    }],
  );

  // ── Road proximity ───────────────────────────────────────────────────────────
  const roadDist = staticFeatures.distanceToMajorRoadMeters;
  const roadProximity: CellMetric = contextMetric(
    "roadProximity",
    "Major road proximity",
    roadDist,
    roadDist !== null ? "m to nearest major road" : "",
    roadDist !== null
      ? `The cell centre is ${Math.round(roadDist)} m from the nearest major mapped road. Closer proximity typically correlates with higher traffic noise and air-pollutant exposure, but no decibel measurement or traffic-volume data exists at this resolution. The figure is a geographic fact, not a noise score.`
      : "No major road was mapped near this cell.",
    0.7,
    [derivedEvidence(
      "Derived from OpenStreetMap road classification",
      "100 m analysis cell; distance to nearest primary/secondary/trunk road segment",
      importedAt,
    )],
  );

  // ── Police proximity ─────────────────────────────────────────────────────────
  const policeDist = staticFeatures.distanceToPoliceMeters ?? null;
  const policeProximity: CellMetric = contextMetric(
    "policeProximity",
    "Police station proximity",
    policeDist,
    policeDist !== null ? "m to nearest station" : "",
    policeDist !== null
      ? `The nearest mapped police station is ${Math.round(policeDist)} m from this cell. This is a factual distance for emergency-access context only. It is not a crime rate or safety indicator — no open hyperlocal crime data exists for this area.`
      : "No mapped police station was found within search range.",
    0.55,
    [derivedEvidence(
      "OpenStreetMap amenity=police",
      "Nearest mapped station from cell centre; OSM coverage may be incomplete",
      importedAt,
    )],
  );

  // ── Electricity context ───────────────────────────────────────────────────────
  const electricityContext: CellMetric = {
    key: "electricityContext",
    label: "Electricity reliability (zone)",
    score: null,
    ratingOutOf10: null,
    status: "unknown",
    value: `${KERC_BESCOM_DATA.saidiHoursPerYear} hrs/yr interruption`,
    unit: `SAIDI — ${KERC_BESCOM_DATA.zone}`,
    explanation: `KERC Annual Performance Review ${KERC_BESCOM_DATA.reportYear} reports ${KERC_BESCOM_DATA.saidiHoursPerYear} hours/year average interruption duration (SAIDI) and ${KERC_BESCOM_DATA.saifiCountPerYear} interruptions/year (SAIFI) for the ${KERC_BESCOM_DATA.zone} area. These are zone-level aggregates — individual feeder and street reliability varies. Real-time outage data is not publicly available from BESCOM.`,
    confidence: 0.65,
    evidence: [{
      sourceName: `KERC Annual Performance Review ${KERC_BESCOM_DATA.reportYear}`,
      sourceUrl: KERC_BESCOM_DATA.sourceUrl,
      sourceType: "official",
      geographicResolution: `${KERC_BESCOM_DATA.zone} zone aggregate; individual feeder reliability not available`,
      updatedAt: KERC_BESCOM_DATA.updatedAt,
    }],
  };

  // ── Water supply context ──────────────────────────────────────────────────────
  const waterData = intelligence?.utilities?.water ?? null;
  const waterSupplyContext: CellMetric = waterData === null
    ? unavailableMetric(
      "waterSupplyContext",
      "Water supply (BWSSB)",
      "BWSSB water supply data not available. Run data ingestion to populate.",
    )
    : contextMetric(
      "waterSupplyContext",
      "Water supply (BWSSB)",
      `${waterData.supplyFrequency}`,
      "",
      `${waterData.authority} supplies ${localityName} from ${waterData.primaryWaterSource}. Typical supply: ${waterData.supplyFrequency}. ${waterData.notes} BWSSB does not publish a real-time supply API; this data is from published annual reports. ${waterData._limitations}`,
      waterData._confidence,
      [{
        sourceName: "BWSSB Annual Report / Jal Jeevan Mission Karnataka ward data",
        sourceUrl: waterData.sourceUrl,
        sourceType: "official",
        geographicResolution: `${wardLabel} — BWSSB zone aggregate; individual street supply varies`,
        updatedAt: "2023-03-31",
      }],
    );

  // ── Transit frequency context ─────────────────────────────────────────────────
  const bmtcData = intelligence?.transit?.bmtc ?? null;
  const metroData = intelligence?.transit?.nammaMetro ?? null;
  // Support both legacy stationsNearHsr and new nearbyStations field names.
  const metroStations = metroData
    ? (metroData.nearbyStations ?? metroData.stationsNearHsr?.map((s) => ({
        name: s.name,
        approximateDistanceKm: s.approximateDistanceFromHsrCenterKm,
        status: s.status,
      })) ?? [])
    : [];
  const transitFrequency: CellMetric = bmtcData === null
    ? unavailableMetric(
      "transitFrequency",
      "Transit frequency & coverage",
      "BMTC route data not available in static intelligence file.",
    )
    : contextMetric(
      "transitFrequency",
      "Transit frequency & coverage",
      `${bmtcData.routeCount} BMTC routes · ${bmtcData.peakHeadwayMinutes.min}–${bmtcData.peakHeadwayMinutes.max} min peak headway`,
      "",
      `${localityName} is served by approximately ${bmtcData.routeCount} BMTC routes (${bmtcData._dataVintage}). Peak headway at major stops: ${bmtcData.peakHeadwayMinutes.min}–${bmtcData.peakHeadwayMinutes.max} minutes; off-peak: ${bmtcData.offPeakHeadwayMinutes.min}–${bmtcData.offPeakHeadwayMinutes.max} minutes. ${metroStations.length > 0 ? `Nearest Namma Metro station: ${metroStations[0]?.name ?? "see context"} (~${metroStations[0]?.approximateDistanceKm ?? "?"} km, ${metroData?.line ?? ""}). ` : ""}${bmtcData._limitations}`,
      bmtcData._confidence,
      [
        {
          sourceName: "BMTC route maps and DULT Bengaluru origin-destination survey 2022-23",
          sourceUrl: bmtcData.sourceUrl,
          sourceType: "official",
          geographicResolution: "Locality-level route coverage; individual stop frequencies not from GTFS",
          updatedAt: bmtcData._dataVintage,
        },
        ...(metroData ? [{
          sourceName: `BMRCL — ${metroData.line}`,
          sourceUrl: metroData.sourceUrl,
          sourceType: "official" as const,
          geographicResolution: "Station-level data; operational status subject to phase completion",
          updatedAt: metroData._dataVintage ?? "2024",
        }] : []),
      ],
    );

  // ── Commute context ───────────────────────────────────────────────────────────
  const destData = intelligence?.transit?.commuteDestinations ?? null;
  let commuteContext: CellMetric;

  if (destData === null) {
    commuteContext = unavailableMetric(
      "commuteContext",
      "Commute context",
      "Commute destination data not available in static intelligence file.",
    );
  } else {
    const employmentDests = destData.destinations
      .filter((d) => d.category === "employment_it")
      .slice(0, 3);

    const routingResults = await Promise.allSettled(
      employmentDests.map((d) =>
        fetchOsrmRoute(cellLat, cellLon, d.latitude, d.longitude)
          .then((r) => ({ name: d.name, result: r })),
      ),
    );

    const routedDests = routingResults
      .filter((r): r is PromiseFulfilledResult<{ name: string; result: Awaited<ReturnType<typeof fetchOsrmRoute>> }> =>
        r.status === "fulfilled" && r.value.result !== null,
      )
      .map((r) => ({
        name: r.value.name,
        minutes: r.value.result!.durationMinutes,
      }));

    const routedSummary = routedDests.length > 0
      ? routedDests.map((d) => `${d.name}: ${d.minutes} min`).join("; ")
      : null;

    const allDests = destData.destinations
      .map((d) => `${d.name} (${d.approxDistanceKm} km, ${d.osmRoutingOffPeakMin.from}–${d.osmRoutingOffPeakMin.to} min off-peak)`)
      .join("; ");

    commuteContext = contextMetric(
      "commuteContext",
      "Commute context",
      routedSummary ?? `${destData.destinations.find((d) => d.category === "employment_it")?.name ?? "Employment hub"}: see destinations`,
      "",
      `Off-peak drive-time context from this cell.${routedSummary ? ` OSM routing results: ${routedSummary}.` : ""} All destinations: ${allDests}. Peak-hour times are 2–5× longer due to Bengaluru traffic. Bengaluru has no open real-time traffic API; these are road-network-based estimates only. ${destData._limitations}`,
      destData._confidence,
      [
        {
          sourceName: "OSRM — OpenStreetMap road network routing (no real-time traffic)",
          sourceUrl: "https://project-osrm.org/",
          sourceType: "derived",
          geographicResolution: "Cell centroid to destination centroid; driving profile; off-peak only",
          updatedAt: new Date().toISOString(),
        },
        derivedEvidence(
          "Destination coordinates from OpenStreetMap",
          "Named employment and transit destinations; representative centroids",
          importedAt,
        ),
      ],
    );
  }

  // ── Civic complaints context ──────────────────────────────────────────────────
  const complaintsData = intelligence?.civic?.complaints ?? null;
  const crimeData = intelligence?.civic?.crime ?? null;

  const civicComplaints: CellMetric = complaintsData === null
    ? unavailableMetric(
      "civicComplaints",
      "Civic complaints (ward)",
      "BBMP Sahaaya ward complaint data not available.",
    )
    : contextMetric(
      "civicComplaints",
      "Civic complaints (ward)",
      `~${complaintsData.totalComplaintsPerYear.approx} registered/yr`,
      "",
      `BBMP Sahaaya ward data (${complaintsData.dataVintage}) shows approximately ${complaintsData.totalComplaintsPerYear.approx} registered complaints/year for ${wardLabel}. Top issues: ${complaintsData.topCategories.slice(0, 3).map((c) => `${c.category} (${c.relativeFrequency})`).join(", ")}. ${complaintsData._limitations}`,
      complaintsData._confidence,
      complaintsData.sourceUrls.map((url) => ({
        sourceName: url.includes("bbmp") ? "BBMP Sahaaya grievance portal" : url.includes("ichange") ? "iChangeMyCity" : "Citizen Matters",
        sourceUrl: url,
        sourceType: "open-data" as const,
        geographicResolution: `${wardLabel} aggregate; not cell-level`,
        updatedAt: complaintsData.dataVintage,
      })),
    );

  // Use the generic localityNote field; fall back to legacy hsrLayoutNote.
  const crimeNote = crimeData
    ? (crimeData.localityNote ?? crimeData.hsrLayoutNote ?? `No ward-level or locality-level crime breakdown is publicly available for ${localityName}. Displaying city-level data would misrepresent local conditions.`)
    : null;

  const crimeContext: CellMetric = crimeData === null
    ? unavailableMetric(
      "crimeContext",
      "Crime context",
      `No open locality-level crime data exists for ${localityName}. Karnataka crime statistics are published only at city/district level.`,
    )
    : contextMetric(
      "crimeContext",
      "Crime context",
      "City-level data only",
      "",
      `${crimeNote} No ward-level or locality-level crime breakdown is publicly available. Displaying city-level data would misrepresent ${localityName}-specific conditions. Confidence is intentionally low (${Math.round(crimeData._confidence * 100)}%) — this metric is shown to be explicit about the limitation.`,
      crimeData._confidence,
      crimeData.sourceUrls.map((url) => ({
        sourceName: url.includes("ncrb") ? "NCRB Crime in India 2022" : url.includes("kscrb") ? "Karnataka SCRB Annual Report" : "Bengaluru City Police",
        sourceUrl: url,
        sourceType: "official" as const,
        geographicResolution: crimeData.dataLevel,
        updatedAt: "2022",
      })),
    );

  // ── Internet / network quality ────────────────────────────────────────────────
  const internetData = intelligence?.civic?.internet ?? null;
  const networkQuality: CellMetric = internetData === null
    ? unavailableMetric(
      "networkQuality",
      "Network quality",
      "No reliable public dataset provides representative 100 m mobile or broadband quality data here. TRAI data is state-level; Ookla tiles require a commercial license. Community measurements are planned.",
    )
    : contextMetric(
      "networkQuality",
      "Network / internet",
      `${internetData.fiberAvailability} fiber`,
      "",
      `Fiber availability in ${localityName}: ${internetData.fiberAvailability}. Confirmed ISPs with FTTH coverage: ${internetData.confirmedIsps.filter((i) => i.technology === "FTTH").map((i) => i.name).join(", ")}. Bengaluru city median download speed: ${internetData.bengaluruMedianDownloadMbps} Mbps (Ookla Q4 2023). ${internetData._limitations}`,
      internetData._confidence,
      [
        {
          sourceName: "TRAI Broadband Report Q4 2023-24",
          sourceUrl: "https://www.trai.gov.in/",
          sourceType: "official",
          geographicResolution: "Karnataka telecom circle; not locality-level",
          updatedAt: "2024-03-31",
        },
        {
          sourceName: "Ookla Speedtest Global Index — Bengaluru Q4 2023 (research citation)",
          sourceUrl: "https://www.speedtest.net/global-index",
          sourceType: "crowdsourced",
          geographicResolution: "City-level median; individual speeds vary by ISP, plan, and building",
          updatedAt: "2023-12-31",
        },
      ],
    );

  // ── Local walkability (connectivity) ──────────────────────────────────────────
  const connectivityScore = staticScores.connectivity;
  const connectivity: CellMetric = connectivityScore === null
    ? unavailableMetric(
      "connectivity",
      "Local walkability",
      "Mapped road and destination evidence is insufficient for this cell.",
    )
    : {
      key: "connectivity",
      label: "Local walkability",
      score: connectivityScore,
      ratingOutOf10: connectivityScore,
      status: statusFromScore(connectivityScore),
      value: `${staticFeatures.roadLengthMeters} m roads · ${staticFeatures.amenityCount} amenities`,
      explanation: "Derived from mapped destination diversity and road network density within walking distance. Higher means more categories of daily destinations (transit, shops, healthcare, parks) are reachable on foot. Does not include measured journey times, footpath quality, or congestion.",
      confidence: 0.58,
      evidence: [derivedEvidence(
        "Derived from OpenStreetMap road, amenity, and transport geometry",
        "100 m analysis cell; mapping completeness varies",
        importedAt,
      )],
    };

  const meters = (value: number | null | undefined) =>
    value === null || value === undefined ? "an unmapped distance" : `${Math.round(value)} m`;

  function accessMetric(
    key: string,
    label: string,
    score: number | null | undefined,
    value: number | null | undefined,
    unit: string,
    explanation: string,
    confidence: number,
    unavailableText: string,
    resolution = "100 m analysis cell; nearest-feature distance and 500–600 m density from mapped OSM points",
  ): CellMetric {
    if (score === null || score === undefined) {
      return unavailableMetric(key, label, unavailableText);
    }
    return {
      key,
      label,
      score,
      ratingOutOf10: score,
      status: statusFromScore(score),
      value: value ?? null,
      unit,
      explanation,
      confidence,
      evidence: [derivedEvidence("Derived from OpenStreetMap amenity, shop and transport geometry", resolution, importedAt)],
    };
  }

  const education = accessMetric(
    "education",
    "Schools & colleges access",
    staticScores.education,
    staticFeatures.distanceToSchoolMeters,
    "m to nearest school",
    `Nearest mapped school, college or kindergarten is ${meters(staticFeatures.distanceToSchoolMeters)} away, with ${staticFeatures.schoolCount ?? 0} within 600 m. This is a proximity and density access proxy — not a quality rating of any institution. UDISE+ quality data is published only at district/block level.`,
    0.55,
    `No mapped school, college or kindergarten was found within reach of this cell in ${localityName}.`,
  );

  const healthcare = accessMetric(
    "healthcare",
    "Healthcare access",
    staticScores.healthcare,
    staticFeatures.distanceToHealthcareMeters,
    "m to nearest facility",
    `Nearest mapped hospital, clinic, doctor or pharmacy is ${meters(staticFeatures.distanceToHealthcareMeters)} away, with ${staticFeatures.healthcareCount ?? 0} within 600 m. Access proxy only — it does not describe capacity, specialties, quality, or opening hours.`,
    0.55,
    `No mapped healthcare facility was found within reach of this cell in ${localityName}.`,
  );

  const metroNote =
    staticFeatures.distanceToMetroStationMeters !== null && staticFeatures.distanceToMetroStationMeters !== undefined
      ? ` Nearest Namma Metro station ~${meters(staticFeatures.distanceToMetroStationMeters)}.`
      : "";
  const transit = accessMetric(
    "transit",
    "Public transport access",
    staticScores.transit,
    staticFeatures.distanceToTransitMeters,
    "m to nearest stop",
    `Nearest mapped bus stop is ${meters(staticFeatures.distanceToTransitMeters)} away, with ${staticFeatures.transitStopCount ?? 0} within 500 m.${metroNote} Based on mapped stop locations only — does not include BMTC route frequency, reliability, or peak-hour service levels.`,
    0.50,
    `No mapped public-transport stop was found within reach of this cell in ${localityName}.`,
  );

  const dailyNeeds = accessMetric(
    "dailyNeeds",
    "Daily-needs retail",
    staticScores.dailyNeeds,
    staticFeatures.distanceToMarketMeters,
    "m to nearest shop",
    `Nearest mapped supermarket, convenience or grocery shop is ${meters(staticFeatures.distanceToMarketMeters)} away, with ${staticFeatures.dailyNeedsCount ?? 0} within 500 m. Reflects mapped retail only; unmapped or recently-opened shops are not counted.`,
    0.50,
    `No mapped daily-needs retail was found within reach of this cell in ${localityName}.`,
  );

  const greenSpace = accessMetric(
    "greenSpace",
    "Parks & green space",
    staticScores.greenSpace,
    staticFeatures.distanceToParkMeters,
    "m to nearest park edge",
    `Nearest mapped park, garden or green space edge is ${meters(staticFeatures.distanceToParkMeters)} away, with ${staticFeatures.parkCount ?? 0} within 400 m. Based on mapped green polygons; does not assess upkeep, public access, or tree canopy coverage.`,
    0.50,
    `No mapped park or green space was found within reach of this cell in ${localityName}.`,
  );

  const nearbyAmenities: CellMetric = {
    key: "nearbyAmenities",
    label: "Mapped amenities in cell",
    score: null,
    ratingOutOf10: null,
    status: "unknown",
    value: staticFeatures.amenityCount,
    unit: "mapped in cell",
    explanation: "Count of public-map amenities whose mapped centres fall inside this 100 m cell. Context only — not scored.",
    confidence: 0.60,
    evidence: [derivedEvidence("OpenStreetMap points of interest", "100 m analysis cell", importedAt)],
  };

  const constructionProximity: CellMetric = {
    key: "constructionProximity",
    label: "Mapped construction activity",
    score: null,
    ratingOutOf10: null,
    status: "unknown",
    value: staticFeatures.constructionCount,
    unit: "mapped objects",
    explanation: staticFeatures.constructionCount
      ? "Construction-tagged objects are currently mapped in this cell. OSM construction coverage may be incomplete; active sites without OSM tags are not counted."
      : "No construction-tagged object is currently mapped in this cell. Absence is not proof that no construction exists.",
    confidence: staticFeatures.constructionCount ? 0.48 : 0.20,
    evidence: [derivedEvidence("OpenStreetMap construction tags", "Mapped objects in 100 m cell", importedAt)],
  };

  const metrics: CellMetrics = {
    airQuality,
    floodSusceptibility,
    rainfall,
    connectivity,
    education,
    healthcare,
    transit,
    dailyNeeds,
    greenSpace,
    drainProximity,
    roadProximity,
    policeProximity,
    electricityContext,
    networkQuality,
    constructionProximity,
    nearbyAmenities,
    transitFrequency,
    commuteContext,
    heatIslandContext,
    ndviGreenCover,
    waterSupplyContext,
    civicComplaints,
    crimeContext,
  };

  const categories = buildCategories(metrics);
  const overall = calculateOverallScore(metrics);
  const updatedAt = [air?.fetchedAt, weather?.fetchedAt, importedAt].filter(Boolean).sort().at(-1) || importedAt;

  const floodAlert =
    floodSusceptibility.ratingOutOf10 !== null &&
    floodSusceptibility.ratingOutOf10 < 3.5;

  return {
    id: cell.properties.id,
    bounds: cell.geometry,
    center: {
      latitude: cell.properties.centerLatitude,
      longitude: cell.properties.centerLongitude,
    },
    sizeMeters: cell.properties.sizeMeters,
    metrics,
    categories,
    overallScore: overall.score,
    riskLevel: overall.riskLevel,
    confidence: overall.confidence,
    updatedAt,
    floodAlert,
  };
}
