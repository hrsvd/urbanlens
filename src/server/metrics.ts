import "server-only";

import { SOURCE_URLS } from "@/lib/constants";
import {
  airQualityScore,
  calculateOverallScore,
  rainfallScore,
  scoreFloodSusceptibility,
  statusFromScore,
} from "@/lib/scoring";
import type {
  AnalysisCell,
  AnalysisCellFeature,
  CellMetric,
  CellMetrics,
  MetricEvidence,
} from "@/lib/types";
import type { AirQualityResult, WeatherResult } from "./external";

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

export function buildCellMetrics(
  cell: AnalysisCellFeature,
  importedAt: string,
  air: AirQualityResult | null,
  weather: WeatherResult | null,
): AnalysisCell {
  const staticFeatures = cell.properties.staticFeatures;
  const staticScores = cell.properties.staticScores;

  const pm25 = air?.current.pm2_5 ?? null;
  const aqiScore = airQualityScore(pm25, air?.current.us_aqi ?? null);
  const airQuality: CellMetric = aqiScore === null
    ? unavailableMetric(
      "airQuality",
      "Air quality",
      "The modelled air-quality service is temporarily unavailable. No replacement value has been inferred.",
    )
    : {
      key: "airQuality",
      label: "Air quality",
      score: aqiScore,
      ratingOutOf10: aqiScore,
      status: statusFromScore(aqiScore),
      value: pm25,
      unit: "µg/m³ PM2.5",
      explanation: `Modelled outdoor PM2.5 is ${pm25} µg/m³ at the provider's regional model cell. This is not an indoor or property-level reading.`,
      confidence: 0.55,
      evidence: [{
        sourceName: "Open-Meteo Air Quality (CAMS global forecast)",
        sourceUrl: SOURCE_URLS.openMeteoAir,
        sourceType: "modelled",
        geographicResolution: "Approximately 45 km global atmospheric-model grid",
        collectedAt: air?.current.time,
        updatedAt: air?.fetchedAt,
      }],
    };

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
          geographicResolution: "Mapped locations; completeness and dates vary by source layer",
          updatedAt: importedAt,
        },
        {
          sourceName: "BBMP stormwater-drain maps 2022 + OpenStreetMap waterways",
          sourceUrl: SOURCE_URLS.openCityDrains,
          sourceType: "open-data",
          geographicResolution: "Mapped line geometry",
          updatedAt: importedAt,
        },
        ...(staticFeatures.elevationMeters !== null && staticFeatures.elevationMeters !== undefined ? [{
          sourceName: "Copernicus DEM GLO-90 via Open-Meteo Elevation API",
          sourceUrl: "https://open-meteo.com/en/docs/elevation-api",
          sourceType: "modelled" as const,
          geographicResolution: "90 m digital elevation model; cell-centre sample and 8-neighbour derivation",
          updatedAt: importedAt,
        }] : []),
        ...(weather ? rainfall.evidence : []),
      ],
    };

  const drainScore = staticScores.drainProximity;
  const drainProximity: CellMetric = drainScore === null
    ? unavailableMetric(
      "drainProximity",
      "Drain context",
      "No usable mapped drain geometry was found near this cell.",
    )
    : {
      key: "drainProximity",
      label: "Drain context",
      score: drainScore,
      ratingOutOf10: drainScore,
      status: statusFromScore(drainScore),
      value: staticFeatures.distanceToDrainMeters,
      unit: "m to mapped drain",
      explanation: `The cell centre is approximately ${staticFeatures.distanceToDrainMeters} m from mapped stormwater-drain geometry. Proximity can indicate both drainage infrastructure and exposure; it is not treated as danger by itself.`,
      confidence: 0.66,
      evidence: [{
        sourceName: "OpenCity / BBMP stormwater-drain maps 2022 and OpenStreetMap",
        sourceUrl: SOURCE_URLS.openCityDrains,
        sourceType: "open-data",
        geographicResolution: "Nearest mapped line from the cell centre",
        updatedAt: importedAt,
      }],
    };

  const noiseScore = staticScores.estimatedNoise;
  const estimatedNoise: CellMetric = noiseScore === null
    ? unavailableMetric(
      "estimatedNoise",
      "Estimated environmental noise",
      "Road geometry is insufficient for a noise estimate. No sound level is inferred.",
    )
    : {
      key: "estimatedNoise",
      label: "Estimated environmental noise",
      score: noiseScore,
      ratingOutOf10: noiseScore,
      status: statusFromScore(noiseScore),
      value: staticFeatures.distanceToMajorRoadMeters,
      unit: "m to major road",
      explanation: `A lower-confidence estimate from major-road distance, mapped commercial activity, bus stops, and construction. It is not a live dB measurement.`,
      confidence: 0.45,
      evidence: [derivedEvidence(
        "Derived from OpenStreetMap transport and land-use features",
        "100 m analysis cell; mapping completeness varies",
        importedAt,
      )],
    };

  const connectivityScore = staticScores.connectivity;
  const connectivity: CellMetric = connectivityScore === null
    ? unavailableMetric(
      "connectivity",
      "Local connectivity",
      "Mapped road and amenity evidence is insufficient for this cell.",
    )
    : {
      key: "connectivity",
      label: "Local connectivity",
      score: connectivityScore,
      ratingOutOf10: connectivityScore,
      status: statusFromScore(connectivityScore),
      value: `${staticFeatures.roadLengthMeters} m roads · ${staticFeatures.amenityCount} amenities`,
      explanation: "Derived from mapped road length, public-transport stops, and nearby amenity density. It does not include measured travel times.",
      confidence: 0.58,
      evidence: [derivedEvidence(
        "Derived from OpenStreetMap road and amenity geometry",
        "100 m analysis cell; mapping completeness varies",
        importedAt,
      )],
    };

  const networkQuality = unavailableMetric(
    "networkQuality",
    "Network quality",
    "No reliable, reusable public dataset provides representative 100 m mobile or internet quality here. Community measurements are planned.",
  );

  const nearbyAmenities: CellMetric = {
    key: "nearbyAmenities",
    label: "Mapped amenities",
    score: null,
    ratingOutOf10: null,
    status: "unknown",
    value: staticFeatures.amenityCount,
    unit: "mapped in cell",
    explanation: "Count of public-map amenities whose mapped centres fall inside this cell. It is context only and is not scored.",
    confidence: 0.6,
    evidence: [derivedEvidence("OpenStreetMap points of interest", "100 m analysis cell", importedAt)],
  };

  const constructionProximity: CellMetric = {
    key: "constructionProximity",
    label: "Mapped construction",
    score: null,
    ratingOutOf10: null,
    status: "unknown",
    value: staticFeatures.constructionCount,
    unit: "mapped objects",
    explanation: staticFeatures.constructionCount
      ? "Construction-tagged objects are mapped in this cell. Completeness is not guaranteed."
      : "No construction-tagged object is currently mapped in this cell; absence is not proof that no construction exists.",
    confidence: staticFeatures.constructionCount ? 0.48 : 0.2,
    evidence: [derivedEvidence("OpenStreetMap construction tags", "Mapped objects in 100 m cell", importedAt)],
  };

  const metrics: CellMetrics = {
    airQuality,
    floodSusceptibility,
    drainProximity,
    rainfall,
    estimatedNoise,
    connectivity,
    networkQuality,
    constructionProximity,
    nearbyAmenities,
  };
  const overall = calculateOverallScore(metrics);
  const updatedAt = [air?.fetchedAt, weather?.fetchedAt, importedAt].filter(Boolean).sort().at(-1) || importedAt;

  return {
    id: cell.properties.id,
    bounds: cell.geometry,
    center: {
      latitude: cell.properties.centerLatitude,
      longitude: cell.properties.centerLongitude,
    },
    sizeMeters: cell.properties.sizeMeters,
    metrics,
    overallScore: overall.score,
    riskLevel: overall.riskLevel,
    confidence: overall.confidence,
    updatedAt,
  };
}
