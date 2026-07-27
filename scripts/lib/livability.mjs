/**
 * Livability access features and static score functions for HSR analysis cells.
 *
 * Every signal here is derived from the same OpenStreetMap ingestion the rest of
 * the artifact uses. Nothing is invented: a category with no mapped evidence
 * near a cell returns `null` (unavailable) and is dropped from scoring, exactly
 * like the existing network-quality field. Scores describe the 100 m cell, never
 * a building, resident, or property.
 */

const EARTH_RADIUS = 6_378_137;

export function lonLatToMercator([longitude, latitude]) {
  return [
    (EARTH_RADIUS * longitude * Math.PI) / 180,
    EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
  ];
}

const clamp = (value, min = 0, max = 10) => Math.min(max, Math.max(min, value));

function round1(value) {
  return value === null || value === undefined ? null : Number(value.toFixed(1));
}

export function nearestPointDistance(center, points) {
  if (!points.length) return null;
  const [cx, cy] = lonLatToMercator(center);
  let minimum = Infinity;
  for (const p of points) {
    const [x, y] = lonLatToMercator(p);
    minimum = Math.min(minimum, Math.hypot(x - cx, y - cy));
  }
  return Number.isFinite(minimum) ? Math.round(minimum) : null;
}

export function countWithinRadius(center, points, radiusMeters) {
  const [cx, cy] = lonLatToMercator(center);
  let count = 0;
  for (const p of points) {
    const [x, y] = lonLatToMercator(p);
    if (Math.hypot(x - cx, y - cy) <= radiusMeters) count += 1;
  }
  return count;
}

function pointSegmentDistance(center, start, end) {
  const p = lonLatToMercator(center);
  const a = lonLatToMercator(start);
  const b = lonLatToMercator(end);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function nearestLineDistance(center, lines) {
  let minimum = Infinity;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      minimum = Math.min(minimum, pointSegmentDistance(center, line[i], line[i + 1]));
    }
  }
  return Number.isFinite(minimum) ? Math.round(minimum) : null;
}

/**
 * Proximity + density access score on a 0–10 scale where higher means better
 * access. `near` earns full marks, `far` earns the floor, and mapped density
 * within `radius` adds a small, capped bonus. Returns null when nothing is
 * mapped for the category anywhere in HSR reach.
 */
export function accessScore(distance, count, { near, far, perCount = 0.6, bonusCap = 2.2, floor = 1 }) {
  if (distance === null) return count > 0 ? round1(clamp(floor + count * perCount)) : null;
  const proximity =
    distance <= near
      ? 10
      : distance >= far
        ? floor
        : 10 - ((distance - near) / (far - near)) * (10 - floor);
  const bonus = Math.min(bonusCap, (count || 0) * perCount);
  return round1(clamp(proximity + bonus));
}

/**
 * Destination-diversity walkability score (replaces road-length-based connectivity).
 *
 * Measures how many categories of daily destinations are reachable from the
 * cell on foot, with distance decay per category. Each category contributes
 * its maximum points at `near` distance and tapers to 0 at `far`.
 *
 * Category weights reflect importance to daily walkable errands:
 *   transit (2.5) + dailyNeeds (2.5) + healthcare (1.5) + greenSpace (1.5) + education (1.5)
 *   + amenity bonus (0.5) = 10.0 maximum
 *
 * An amenity bonus (up to 0.5) rewards fine-grained mapped density within the cell.
 * The formula uses livability features that are already computed by deriveLivability,
 * so this function is called after that pass completes.
 */
export function walkabilityScore(livFeatures, amenityCount) {
  function decay(distM, nearM, farM, maxPts) {
    if (distM === null || distM === undefined) return 0;
    if (distM <= nearM) return maxPts;
    if (distM >= farM) return 0;
    return maxPts * (1 - (distM - nearM) / (farM - nearM));
  }

  const transit = decay(livFeatures.distanceToTransitMeters, 150, 600, 2.5);
  const dailyNeeds = decay(livFeatures.distanceToMarketMeters, 100, 500, 2.5);
  const healthcare = decay(livFeatures.distanceToHealthcareMeters, 200, 800, 1.5);
  const greenSpace = decay(livFeatures.distanceToParkMeters, 150, 600, 1.5);
  const education = decay(livFeatures.distanceToSchoolMeters, 200, 800, 1.5);
  const amenityBonus = Math.min(0.5, (amenityCount || 0) * 0.1);

  const raw = transit + dailyNeeds + healthcare + greenSpace + education + amenityBonus;
  return raw === 0 ? null : round1(clamp(raw));
}

const CATEGORY_KINDS = {
  education: new Set(["school", "college", "university", "kindergarten"]),
  healthcare: new Set(["hospital", "clinic", "doctors", "pharmacy", "chemist"]),
  dailyNeeds: new Set([
    "supermarket",
    "convenience",
    "greengrocer",
    "general",
    "department_store",
    "bakery",
    "butcher",
    "marketplace",
  ]),
  transit: new Set(["bus_stop", "bus_station", "platform", "stop_position", "station"]),
  police: new Set(["police"]),
};

function isMetro(tags) {
  const station = (tags.station || "").toLowerCase();
  const network = (tags.network || tags.operator || "").toLowerCase();
  return (
    station === "subway" ||
    station === "metro" ||
    station === "light_rail" ||
    tags.subway === "yes" ||
    /namma metro|bmrcl|metro/.test(network)
  );
}

/**
 * Classify an OSM element's tags into a livability category, or null. Metro
 * stations are separated from ordinary bus/rail transit so metro proximity can
 * be weighted more strongly.
 */
export function classifyOsmTags(tags = {}) {
  if (!tags) return null;
  if (tags.amenity === "police") return "police";
  if ((tags.railway === "station" || tags.railway === "subway_entrance") && isMetro(tags)) return "metro";
  if (tags.public_transport === "station" && isMetro(tags)) return "metro";
  if (CATEGORY_KINDS.education.has(tags.amenity)) return "education";
  if (CATEGORY_KINDS.healthcare.has(tags.amenity) || tags.shop === "chemist") return "healthcare";
  if (CATEGORY_KINDS.dailyNeeds.has(tags.shop) || tags.amenity === "marketplace") return "dailyNeeds";
  if (tags.highway === "bus_stop" || tags.amenity === "bus_station") return "transit";
  if (CATEGORY_KINDS.transit.has(tags.public_transport)) return "transit";
  if (tags.railway === "station") return "transit";
  return null;
}

/** Classify a normalized bootstrap POI `kind` string when raw tags are absent. */
export function classifyKind(kind = "") {
  if (CATEGORY_KINDS.education.has(kind)) return "education";
  if (CATEGORY_KINDS.healthcare.has(kind)) return "healthcare";
  if (CATEGORY_KINDS.dailyNeeds.has(kind)) return "dailyNeeds";
  if (CATEGORY_KINDS.transit.has(kind) || kind === "bus_stop") return "transit";
  if (kind === "police") return "police";
  return null;
}

export function emptyCategories() {
  return { education: [], healthcare: [], transit: [], metro: [], dailyNeeds: [], police: [] };
}

/**
 * Compute every livability feature and 0–10 sub-score for one cell centre.
 * `categories` holds arrays of [lon, lat] points; `greenLines` holds park/green
 * polygon exteriors as coordinate arrays.
 */
export function deriveLivability(center, categories, greenLines = [], amenityCount = 0) {
  const distanceToSchoolMeters = nearestPointDistance(center, categories.education);
  const schoolCount = countWithinRadius(center, categories.education, 600);
  const distanceToHealthcareMeters = nearestPointDistance(center, categories.healthcare);
  const healthcareCount = countWithinRadius(center, categories.healthcare, 600);
  const distanceToTransitMeters = nearestPointDistance(center, categories.transit);
  const distanceToMetroStationMeters = nearestPointDistance(center, categories.metro);
  const transitStopCount = countWithinRadius(center, categories.transit, 500);
  const distanceToMarketMeters = nearestPointDistance(center, categories.dailyNeeds);
  const dailyNeedsCount = countWithinRadius(center, categories.dailyNeeds, 500);
  const distanceToParkMeters = nearestLineDistance(center, greenLines);
  const parkCount = greenLines.length
    ? greenLines.filter((line) => nearestLineDistance(center, [line]) !== null && nearestLineDistance(center, [line]) <= 400).length
    : 0;
  const distanceToPoliceMeters = nearestPointDistance(center, categories.police);

  const education = accessScore(distanceToSchoolMeters, schoolCount, { near: 150, far: 1200, perCount: 0.4 });
  const healthcare = accessScore(distanceToHealthcareMeters, healthcareCount, { near: 150, far: 1400, perCount: 0.35 });
  // Metro proximity, where present, lifts the transit score; otherwise bus access stands alone.
  const busTransit = accessScore(distanceToTransitMeters, transitStopCount, { near: 120, far: 900, perCount: 0.3 });
  const metroTransit =
    distanceToMetroStationMeters === null
      ? null
      : accessScore(distanceToMetroStationMeters, 0, { near: 300, far: 2500, perCount: 0, bonusCap: 0 });
  const transit =
    busTransit === null && metroTransit === null
      ? null
      : round1(clamp(Math.max(busTransit ?? 0, (metroTransit ?? 0) * 0.9 + (busTransit ?? 0) * 0.1)));
  const dailyNeeds = accessScore(distanceToMarketMeters, dailyNeedsCount, { near: 120, far: 900, perCount: 0.3 });
  const greenSpace = accessScore(distanceToParkMeters, parkCount, { near: 120, far: 1000, perCount: 0.5 });

  // Destination-diversity walkability (replaces road-length connectivity).
  const livFeatures = {
    distanceToSchoolMeters,
    distanceToHealthcareMeters,
    distanceToTransitMeters,
    distanceToMarketMeters,
    distanceToParkMeters,
  };
  const connectivity = walkabilityScore(livFeatures, amenityCount);

  return {
    features: {
      distanceToSchoolMeters,
      schoolCount,
      distanceToHealthcareMeters,
      healthcareCount,
      distanceToTransitMeters,
      distanceToMetroStationMeters,
      transitStopCount,
      distanceToMarketMeters,
      dailyNeedsCount,
      distanceToParkMeters,
      parkCount,
      distanceToPoliceMeters,
    },
    scores: { education, healthcare, transit, dailyNeeds, greenSpace, connectivity },
  };
}

// Static subset of DEFAULT_WEIGHTS (src/lib/constants.ts) used for the
// pre-load heatmap approximation. Excludes dynamic signals (airQuality,
// rainfall) and the three metrics removed from scoring (drainProximity,
// estimatedNoise, safetyProxy). Weights scaled to sum to 1.0.
// Keep in sync with DEFAULT_WEIGHTS in src/lib/constants.ts.
export const STATIC_WEIGHTS = {
  floodBaseline: 0.25,
  healthcare: 0.15,
  transit: 0.14,
  connectivity: 0.12,
  education: 0.12,
  dailyNeeds: 0.11,
  greenSpace: 0.11,
};

/** Weighted, re-normalised static approximation of a cell's overall score. */
export function staticOverall(staticScores) {
  const available = [
    { score: staticScores.floodBaseline, weight: STATIC_WEIGHTS.floodBaseline },
    { score: staticScores.healthcare, weight: STATIC_WEIGHTS.healthcare },
    { score: staticScores.transit, weight: STATIC_WEIGHTS.transit },
    { score: staticScores.connectivity, weight: STATIC_WEIGHTS.connectivity },
    { score: staticScores.education, weight: STATIC_WEIGHTS.education },
    { score: staticScores.dailyNeeds, weight: STATIC_WEIGHTS.dailyNeeds },
    { score: staticScores.greenSpace, weight: STATIC_WEIGHTS.greenSpace },
  ].filter((item) => item.score !== null && item.score !== undefined);
  const total = available.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return null;
  return Number((available.reduce((sum, item) => sum + item.score * item.weight, 0) / total).toFixed(1));
}

/** Green/park polygon exteriors → line coordinate arrays for edge distance. */
export function greenLinesFromFeatures(features = []) {
  return features
    .filter((feature) => feature.geometry && feature.geometry.type === "Polygon")
    .map((feature) => feature.geometry.coordinates[0])
    .filter((ring) => Array.isArray(ring) && ring.length > 1);
}
