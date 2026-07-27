#!/usr/bin/env node

/**
 * Livability augmentation pass.
 *
 * Adds OSM-derived access features (schools, healthcare, public transport,
 * daily-needs retail, parks/green space) to every HSR cell in an already-
 * generated `public/data/hsr-bootstrap.json`, without re-downloading anything.
 * It reads the same ingestion inputs already on disk:
 *   - the committed bootstrap (grid, green polygons, named POIs);
 *   - the cached raw OSM context (`scripts/cache/osm-hsr-context.json`) when
 *     present, which additionally carries unnamed bus stops, metro stations and
 *     police points.
 *
 * The full `npm run data:ingest` pipeline performs the identical derivation
 * inline (via scripts/lib/livability.mjs); this standalone pass exists so the
 * artifact can be refreshed offline when only the derived features change.
 *
 * This pass also recomputes `staticScores.connectivity` using the
 * destination-diversity walkability formula (walkabilityScore in livability.mjs)
 * which replaced the older road-length-based connectivityScore.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import {
  classifyKind,
  classifyOsmTags,
  deriveLivability,
  emptyCategories,
  greenLinesFromFeatures,
  staticOverall,
} from "./lib/livability.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public", "data", "hsr-bootstrap.json");
const CONTEXT_CACHE = path.join(ROOT, "scripts", "cache", "osm-hsr-context.json");

function elementCenter(element) {
  if (element.type === "node" && Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return [element.lon, element.lat];
  }
  if (element.center && Number.isFinite(element.center.lon)) {
    return [element.center.lon, element.center.lat];
  }
  if (Array.isArray(element.geometry) && element.geometry.length) {
    const sum = element.geometry.reduce((acc, g) => [acc[0] + g.lon, acc[1] + g.lat], [0, 0]);
    return [sum[0] / element.geometry.length, sum[1] / element.geometry.length];
  }
  return null;
}

async function categoriesFromContext(boundary) {
  const categories = emptyCategories();
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(CONTEXT_CACHE, "utf8"));
  } catch {
    return null;
  }
  for (const element of raw.elements || []) {
    const category = classifyOsmTags(element.tags);
    if (!category) continue;
    const center = elementCenter(element);
    if (!center || !booleanPointInPolygon(point(center), boundary)) continue;
    categories[category].push(center);
  }
  return categories;
}

function categoriesFromBootstrapPois(pois, boundary) {
  const categories = emptyCategories();
  for (const feature of pois.features) {
    const category = classifyKind(feature.properties.kind);
    if (!category) continue;
    const center = feature.geometry.coordinates;
    if (!booleanPointInPolygon(point(center), boundary)) continue;
    categories[category].push(center);
  }
  return categories;
}

const bootstrap = JSON.parse(await fs.readFile(OUTPUT, "utf8"));
const boundary = bootstrap.boundary;

let categories = await categoriesFromContext(boundary);
let source = "cached raw OSM context";
if (!categories) {
  categories = categoriesFromBootstrapPois(bootstrap.pois, boundary);
  source = "bootstrap named POIs (raw context cache absent)";
}

const greenLines = greenLinesFromFeatures(bootstrap.green.features);

console.log("HSR livability augmentation");
console.log(`source ${source}`);
console.log(
  `points education=${categories.education.length} healthcare=${categories.healthcare.length} ` +
    `transit=${categories.transit.length} metro=${categories.metro.length} ` +
    `dailyNeeds=${categories.dailyNeeds.length} police=${categories.police.length} greenPolys=${greenLines.length}`,
);

let scoredCells = 0;
for (const cell of bootstrap.grid.features) {
  const center = [cell.properties.centerLongitude, cell.properties.centerLatitude];
  const amenityCount = cell.properties.staticFeatures?.amenityCount ?? 0;

  // deriveLivability now also computes walkability-based connectivity score.
  const { features, scores } = deriveLivability(center, categories, greenLines, amenityCount);
  cell.properties.staticFeatures = { ...cell.properties.staticFeatures, ...features };
  cell.properties.staticScores = { ...cell.properties.staticScores, ...scores };

  const overall = staticOverall(cell.properties.staticScores);
  cell.properties.overallStatic = overall;
  cell.properties.heatScoreOverall = overall;
  cell.properties.heatScoreEducation = scores.education;
  cell.properties.heatScoreHealthcare = scores.healthcare;
  cell.properties.heatScoreTransit = scores.transit;
  cell.properties.heatScoreDailyNeeds = scores.dailyNeeds;
  cell.properties.heatScoreGreenSpace = scores.greenSpace;
  cell.properties.heatScoreConnectivity = scores.connectivity;
  // Remove legacy safetyProxy heatmap property if present from older artifacts.
  delete cell.properties.heatScoreSafety;

  if (overall !== null) scoredCells += 1;
}

bootstrap.meta.livabilityAugmentedAt = new Date().toISOString();
bootstrap.meta.counts = {
  ...bootstrap.meta.counts,
  educationPoints: categories.education.length,
  healthcarePoints: categories.healthcare.length,
  transitPoints: categories.transit.length,
  metroStations: categories.metro.length,
  dailyNeedsPoints: categories.dailyNeeds.length,
  policePoints: categories.police.length,
};

await fs.writeFile(OUTPUT, `${JSON.stringify(bootstrap)}\n`);
const sizeMb = Buffer.byteLength(JSON.stringify(bootstrap)) / 1024 / 1024;
console.log(`write  ${path.relative(ROOT, OUTPUT)} (${sizeMb.toFixed(2)} MB)`);
console.log(`scored ${scoredCells}/${bootstrap.grid.features.length} cells with a static overall`);
