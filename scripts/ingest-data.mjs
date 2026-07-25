#!/usr/bin/env node

/**
 * HSR Intelligence Map ingestion pipeline
 *
 * Sources are fetched here—not in the browser—then clipped to the OSM HSR
 * locality polygon and normalized into one runtime artifact.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", "cache");
const OUTPUT = path.join(ROOT, "public", "data", "hsr-bootstrap.json");
const GRID_SIZE_METERS = Number(process.env.GRID_SIZE_METERS || 100);
const BOUNDARY_RELATION_ID = 17168010;
const USER_AGENT = "HSR-Intelligence-Map/0.1 (open geodata ingestion; local development)";
const EARTH_RADIUS = 6_378_137;
const OSM_API = `https://api.openstreetmap.org/api/0.6/relation/${BOUNDARY_RELATION_ID}/full.json`;
const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_BASE_URL || "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const OPEN_CITY = {
  drains: {
    url: "https://data.opencity.in/dataset/fc97e05c-c54b-44e9-8d98-7663ee887922/resource/801779e6-ed81-457d-bd2a-7e3cc95ad1ee/download/e42be0cb-1bf4-4a7b-9c78-0c0dbdae3237.kml",
    cache: "opencity-drains-2022.kml",
  },
  floodVulnerable: {
    url: "https://data.opencity.in/dataset/b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c/resource/a7d8a01f-1fbc-41e1-85f0-f15ea16b2d27/download/6b3c63b0-f461-4e9c-a2c2-006f734c5b41.kml",
    cache: "opencity-flood-vulnerable.kml",
  },
  floodProne: {
    url: "https://data.opencity.in/dataset/b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c/resource/d90fe768-caba-4c6e-b6b5-a75acd5e88a9/download/00fb1229-dcfd-4f59-813f-885e0c629add.kml",
    cache: "opencity-flood-prone.kml",
  },
  lowLying: {
    url: "https://data.opencity.in/dataset/b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c/resource/62ceac3b-f6e2-4dd1-ae9f-be80b1f2fda8/download/8e87a2fc-e014-4c6e-81f1-d5cb4db57a46.kml",
    cache: "opencity-low-lying.kml",
  },
};

await fs.mkdir(CACHE, { recursive: true });
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, { timeout = 90_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFetch(name, url, parser = JSON.parse) {
  const cachePath = path.join(CACHE, name);
  try {
    const existing = await fs.readFile(cachePath, "utf8");
    console.log(`cache  ${name}`);
    return parser(existing);
  } catch {
    console.log(`fetch  ${url}`);
    const text = await fetchText(url, { timeout: 120_000 });
    await fs.writeFile(cachePath, text);
    return parser(text);
  }
}

async function fetchOverpass(query, cacheName) {
  const cachePath = path.join(CACHE, cacheName);
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    // Expected on first ingestion.
  }

  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        console.log(`fetch  ${cacheName} via ${new URL(endpoint).host} (attempt ${attempt + 1})`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 180_000);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const text = await response.text();
        const parsed = JSON.parse(text);
        await fs.writeFile(cachePath, text);
        return parsed;
      } catch (error) {
        lastError = error;
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw new Error(`Overpass ingestion failed: ${String(lastError)}`);
}

function sameCoordinate(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function stitchRings(lines) {
  const remaining = lines.filter((line) => line.length > 1).map((line) => [...line]);
  const rings = [];
  while (remaining.length) {
    const ring = remaining.shift();
    let progress = true;
    while (!sameCoordinate(ring[0], ring.at(-1)) && progress) {
      progress = false;
      for (let index = 0; index < remaining.length; index += 1) {
        const line = remaining[index];
        if (sameCoordinate(ring.at(-1), line[0])) {
          ring.push(...line.slice(1));
        } else if (sameCoordinate(ring.at(-1), line.at(-1))) {
          ring.push(...line.slice(0, -1).reverse());
        } else if (sameCoordinate(ring[0], line.at(-1))) {
          ring.unshift(...line.slice(0, -1));
        } else if (sameCoordinate(ring[0], line[0])) {
          ring.unshift(...line.slice(1).reverse());
        } else {
          continue;
        }
        remaining.splice(index, 1);
        progress = true;
        break;
      }
    }
    if (!sameCoordinate(ring[0], ring.at(-1))) ring.push(ring[0]);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function boundaryFromOsm(raw) {
  const relation = raw.elements.find((item) => item.type === "relation" && item.id === BOUNDARY_RELATION_ID);
  if (!relation) throw new Error("HSR boundary relation missing from OSM response.");
  const nodes = new Map(
    raw.elements.filter((item) => item.type === "node").map((item) => [item.id, [item.lon, item.lat]]),
  );
  const ways = new Map(raw.elements.filter((item) => item.type === "way").map((item) => [item.id, item]));
  const lines = relation.members
    .filter((member) => member.type === "way" && member.role !== "inner")
    .map((member) => (ways.get(member.ref)?.nodes || []).map((nodeId) => nodes.get(nodeId)).filter(Boolean));
  const rings = stitchRings(lines);
  if (!rings.length) throw new Error("Could not assemble HSR boundary rings.");
  return {
    type: "Feature",
    properties: {
      name: relation.tags.name,
      source: relation.tags.source || "OpenStreetMap contributors",
    },
    geometry: { type: "Polygon", coordinates: [rings[0]] },
  };
}

function bboxForPolygon(feature) {
  const coordinates = feature.geometry.coordinates[0];
  return coordinates.reduce(
    (bbox, [lon, lat]) => [
      Math.min(bbox[0], lon),
      Math.min(bbox[1], lat),
      Math.max(bbox[2], lon),
      Math.max(bbox[3], lat),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

function centerOfCoordinates(coordinates) {
  const flat = coordinates.flat(Infinity).reduce((pairs, value, index, values) => {
    if (index % 2 === 0 && typeof value === "number" && typeof values[index + 1] === "number") {
      pairs.push([value, values[index + 1]]);
    }
    return pairs;
  }, []);
  const sum = flat.reduce((acc, coordinate) => [acc[0] + coordinate[0], acc[1] + coordinate[1]], [0, 0]);
  return flat.length ? [sum[0] / flat.length, sum[1] / flat.length] : null;
}

function centroidInside(feature, boundary) {
  const center = feature.geometry.type === "Point"
    ? feature.geometry.coordinates
    : centerOfCoordinates(feature.geometry.coordinates);
  return center ? booleanPointInPolygon(point(center), boundary) : false;
}

function parseHeight(tags, id) {
  const explicit = Number.parseFloat(tags.height);
  if (Number.isFinite(explicit) && explicit > 1 && explicit < 300) {
    return { height: explicit, levels: Math.max(1, Math.round(explicit / 3.2)), heightSource: "osm-height" };
  }
  const levels = Number.parseFloat(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0 && levels < 80) {
    return { height: levels * 3.2, levels, heightSource: "osm-levels" };
  }
  const baseline = tags.building === "apartments" ? 16 : tags.building === "commercial" ? 13 : 10;
  const deterministicVariation = Number(String(id).slice(-1)) % 4;
  return { height: baseline + deterministicVariation, levels: null, heightSource: "category-heuristic" };
}

function geometryFromElement(element) {
  if (element.type === "node" && Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return { type: "Point", coordinates: [element.lon, element.lat] };
  }
  if (element.type === "way" && element.geometry?.length >= 2) {
    const coordinates = element.geometry.map((coordinate) => [coordinate.lon, coordinate.lat]);
    const isClosed = coordinates.length >= 4 && sameCoordinate(coordinates[0], coordinates.at(-1));
    return isClosed
      ? { type: "Polygon", coordinates: [coordinates] }
      : { type: "LineString", coordinates };
  }
  return null;
}

function featureFromElement(element, extra = {}) {
  const geometry = geometryFromElement(element);
  if (!geometry) return null;
  const tags = element.tags || {};
  return {
    type: "Feature",
    id: `${element.type}/${element.id}`,
    properties: {
      id: `${element.type}/${element.id}`,
      name: tags.name || tags["name:en"] || tags.brand,
      ...extra,
    },
    geometry,
  };
}

function clipLineFeature(feature, boundary) {
  if (feature.geometry.type !== "LineString") return feature;
  const coordinates = feature.geometry.coordinates;
  const runs = [];
  let current = [];
  coordinates.forEach((coordinate, index) => {
    const inside = booleanPointInPolygon(point(coordinate), boundary);
    if (inside) {
      if (!current.length && index > 0) current.push(coordinates[index - 1]);
      current.push(coordinate);
    } else if (current.length) {
      current.push(coordinate);
      if (current.length >= 2) runs.push(current);
      current = [];
    }
  });
  if (current.length >= 2) runs.push(current);
  if (!runs.length) return null;
  const longest = runs.sort((a, b) => b.length - a.length)[0];
  return { ...feature, geometry: { type: "LineString", coordinates: longest } };
}

function normalizeOsm(buildingRaw, contextRaw, boundary) {
  const buildings = [];
  const roads = [];
  const water = [];
  const green = [];
  const pois = [];
  const seen = new Set();

  for (const element of [...buildingRaw.elements, ...contextRaw.elements]) {
    const featureId = `${element.type}/${element.id}`;
    if (seen.has(featureId)) continue;
    seen.add(featureId);
    const tags = element.tags || {};
    const base = featureFromElement(element);
    if (!base) continue;

    if (tags.building && base.geometry.type === "Polygon") {
      const feature = featureFromElement(element, {
        kind: tags.building,
        class: tags.building === "apartments" ? "apartments" : "building",
        ...parseHeight(tags, element.id),
      });
      if (centroidInside(feature, boundary)) buildings.push(feature);
    }

    if (tags.highway && base.geometry.type === "LineString") {
      const feature = clipLineFeature(featureFromElement(element, {
        kind: tags.highway,
        class: ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(tags.highway)
          ? "major"
          : tags.highway,
      }), boundary);
      if (feature) roads.push(feature);
    }

    const waterPolygon =
      base.geometry.type === "Polygon" &&
      (tags.natural === "water" || tags.water || tags.landuse === "reservoir" || tags.natural === "wetland");
    const waterLine = base.geometry.type === "LineString" && tags.waterway;
    if (waterPolygon || waterLine) {
      let feature = featureFromElement(element, {
        kind: tags.waterway || tags.water || tags.natural || "water",
        class: ["drain", "ditch", "canal"].includes(tags.waterway) ? "drain" : "water",
      });
      if (feature.geometry.type === "LineString") feature = clipLineFeature(feature, boundary);
      if (!feature) continue;
      if (centroidInside(feature, boundary) ||
        (feature.geometry.type === "LineString" &&
          feature.geometry.coordinates.some((coordinate) => booleanPointInPolygon(point(coordinate), boundary)))) {
        water.push(feature);
      }
    }

    const isGreen =
      base.geometry.type === "Polygon" &&
      (["park", "garden", "playground", "nature_reserve", "pitch"].includes(tags.leisure) ||
        ["grass", "forest", "recreation_ground", "meadow"].includes(tags.landuse) ||
        ["wood", "scrub", "grassland"].includes(tags.natural));
    if (isGreen) {
      const feature = featureFromElement(element, { kind: tags.leisure || tags.landuse || tags.natural, class: "green" });
      if (centroidInside(feature, boundary)) green.push(feature);
    }

    const isPoi = tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office ||
      tags.public_transport || tags.highway === "bus_stop" || tags.historic;
    if (isPoi && (tags.name || tags.brand)) {
      const center = base.geometry.type === "Point"
        ? base.geometry.coordinates
        : element.center
          ? [element.center.lon, element.center.lat]
          : centerOfCoordinates(base.geometry.coordinates);
      if (center && booleanPointInPolygon(point(center), boundary)) {
        pois.push({
          type: "Feature",
          id: featureId,
          properties: {
            id: featureId,
            name: tags.name || tags.brand,
            kind: tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office ||
              tags.public_transport || tags.highway || "place",
            class: tags.amenity || tags.shop ? "amenity" : "place",
          },
          geometry: { type: "Point", coordinates: center },
        });
      }
    }
  }

  return { buildings, roads, water, green, pois };
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.replace(/<!\\[CDATA\\[|\\]\\]>/g, "").replace(/<[^>]+>/g, "").trim() || undefined;
}

function parseCoordinates(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(",").slice(0, 2).map(Number))
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function parseKml(kml, sourceName) {
  const placemarks = kml.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [];
  const points = [];
  const lines = [];
  placemarks.forEach((block, index) => {
    const name = extractTag(block, "name") || `${sourceName} ${index + 1}`;
    const coordinateBlocks = [...block.matchAll(/<coordinates(?:\s[^>]*)?>([\s\S]*?)<\/coordinates>/gi)];
    coordinateBlocks.forEach((match, coordinateIndex) => {
      const coordinates = parseCoordinates(match[1]);
      if (coordinates.length === 1) {
        points.push({
          type: "Feature",
          properties: {
            id: `${sourceName.toLowerCase().replace(/\W+/g, "-")}-${index}-${coordinateIndex}`,
            name,
            kind: "flood-evidence",
            source: sourceName,
          },
          geometry: { type: "Point", coordinates: coordinates[0] },
        });
      } else if (coordinates.length > 1) {
        lines.push({
          type: "Feature",
          properties: {
            id: `${sourceName.toLowerCase().replace(/\W+/g, "-")}-${index}-${coordinateIndex}`,
            name,
            kind: "stormwater-drain",
            class: "drain",
            source: sourceName,
          },
          geometry: { type: "LineString", coordinates },
        });
      }
    });
  });
  return { points, lines };
}

function lonLatToMercator([longitude, latitude]) {
  return [
    EARTH_RADIUS * longitude * Math.PI / 180,
    EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)),
  ];
}

function mercatorToLonLat([x, y]) {
  return [
    x / EARTH_RADIUS * 180 / Math.PI,
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI,
  ];
}

function pointSegmentDistance(pointCoordinate, start, end) {
  const p = lonLatToMercator(pointCoordinate);
  const a = lonLatToMercator(start);
  const b = lonLatToMercator(end);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distanceToLines(center, features) {
  let minimum = Infinity;
  for (const feature of features) {
    const coordinates = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
    for (const line of coordinates) {
      for (let index = 0; index < line.length - 1; index += 1) {
        minimum = Math.min(minimum, pointSegmentDistance(center, line[index], line[index + 1]));
      }
    }
  }
  return Number.isFinite(minimum) ? Math.round(minimum) : null;
}

function distanceToPoints(center, features) {
  const [cx, cy] = lonLatToMercator(center);
  let minimum = Infinity;
  for (const feature of features) {
    const [x, y] = lonLatToMercator(feature.geometry.coordinates);
    minimum = Math.min(minimum, Math.hypot(x - cx, y - cy));
  }
  return Number.isFinite(minimum) ? Math.round(minimum) : null;
}

function polygonLines(features) {
  return features
    .filter((feature) => feature.geometry.type === "Polygon")
    .map((feature) => ({
      ...feature,
      geometry: { type: "LineString", coordinates: feature.geometry.coordinates[0] },
    }));
}

const clamp = (value, min = 0, max = 10) => Math.min(max, Math.max(min, value));

function drainScore(distance) {
  if (distance === null) return null;
  if (distance < 35) return 5.8;
  if (distance < 250) return 7.6;
  if (distance < 500) return 6.4;
  return 5;
}

function noiseScore(features) {
  if (features.distanceToMajorRoadMeters === null) return null;
  const roadExposure = clamp(5 - features.distanceToMajorRoadMeters / 70, 0, 5);
  const activityExposure = clamp(
    features.commercialCount * 0.25 + features.busStopCount * 0.45 + features.constructionCount * 0.7,
    0,
    2.5,
  );
  return Number(clamp(9.2 - roadExposure - activityExposure).toFixed(1));
}

function connectivityScore(features) {
  const roadSignal = clamp(features.roadLengthMeters / 75, 0, 5.5);
  const amenitySignal = clamp(features.amenityCount * 0.35 + features.busStopCount * 0.6, 0, 4.5);
  return Number(clamp(roadSignal + amenitySignal).toFixed(1));
}

function baselineFloodScore(distanceToFloodPoint, distanceToDrain, distanceToLake) {
  const parts = [];
  if (distanceToFloodPoint !== null) parts.push({ risk: clamp(10 - distanceToFloodPoint / 120), weight: 0.64 });
  if (distanceToDrain !== null) parts.push({ risk: clamp(7 - distanceToDrain / 80), weight: 0.22 });
  if (distanceToLake !== null) parts.push({ risk: clamp(8 - distanceToLake / 100), weight: 0.14 });
  if (!parts.length) return null;
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  const risk = parts.reduce((sum, part) => sum + part.risk * part.weight, 0) / total;
  return Number(clamp(10 - risk).toFixed(1));
}

function elevationAdjustedFloodScore(features) {
  const parts = [];
  if (features.distanceToFloodPointMeters !== null) {
    parts.push({ risk: clamp(10 - features.distanceToFloodPointMeters / 120), weight: 0.44 });
  }
  if (features.distanceToDrainMeters !== null) {
    parts.push({ risk: clamp(7 - features.distanceToDrainMeters / 80), weight: 0.14 });
  }
  if (features.distanceToLakeMeters !== null) {
    parts.push({ risk: clamp(8 - features.distanceToLakeMeters / 100), weight: 0.08 });
  }
  if (features.relativeElevationMeters !== null) {
    parts.push({ risk: clamp(5 - features.relativeElevationMeters * 0.9), weight: 0.24 });
  }
  if (features.localSlopeDegrees !== null) {
    parts.push({ risk: clamp(7 - features.localSlopeDegrees * 0.9), weight: 0.1 });
  }
  if (!parts.length) return null;
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  return Number(clamp(10 - parts.reduce((sum, part) => sum + part.risk * part.weight, 0) / total).toFixed(1));
}

async function fetchElevations(cells) {
  const cachePath = path.join(CACHE, `openmeteo-elevation-${GRID_SIZE_METERS}m.json`);
  const partialPath = path.join(CACHE, `openmeteo-elevation-${GRID_SIZE_METERS}m.partial.json`);
  let elevations;
  try {
    elevations = JSON.parse(await fs.readFile(cachePath, "utf8"));
    if (!Array.isArray(elevations) || elevations.length !== cells.length) throw new Error("stale elevation cache");
    console.log(`cache  ${path.basename(cachePath)}`);
  } catch {
    try {
      elevations = JSON.parse(await fs.readFile(partialPath, "utf8"));
      if (!Array.isArray(elevations) || elevations.length > cells.length) throw new Error("invalid partial elevation cache");
      console.log(`resume ${path.basename(partialPath)} at cell ${elevations.length + 1}`);
    } catch {
      elevations = [];
    }
    for (let offset = elevations.length; offset < cells.length; offset += 100) {
      const batch = cells.slice(offset, offset + 100);
      const params = new URLSearchParams({
        latitude: batch.map((cell) => cell.properties.centerLatitude.toFixed(6)).join(","),
        longitude: batch.map((cell) => cell.properties.centerLongitude.toFixed(6)).join(","),
      });
      console.log(`fetch  elevation cells ${offset + 1}-${offset + batch.length}`);
      let response;
      let lastError;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          response = JSON.parse(await fetchText(`https://api.open-meteo.com/v1/elevation?${params}`, { timeout: 60_000 }));
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            const backoff = 5_000 * (attempt + 1);
            console.log(`retry  elevation batch after ${backoff / 1000}s (${String(error)})`);
            await sleep(backoff);
          }
        }
      }
      if (!response) throw lastError;
      if (!Array.isArray(response.elevation) || response.elevation.length !== batch.length) {
        throw new Error("Open-Meteo elevation response length did not match the requested cells.");
      }
      elevations.push(...response.elevation);
      await fs.writeFile(partialPath, JSON.stringify(elevations));
      // The free endpoint is intentionally treated gently; ingestion is offline.
      if (offset + batch.length < cells.length) await sleep(10_500);
    }
    await fs.writeFile(cachePath, JSON.stringify(elevations));
    await fs.rm(partialPath, { force: true });
  }

  const byPosition = new Map();
  cells.forEach((cell, index) => {
    const elevation = Number.isFinite(elevations[index]) ? Number(elevations[index]) : null;
    cell.properties.staticFeatures.elevationMeters = elevation;
    byPosition.set(`${cell.properties.row}:${cell.properties.column}`, { cell, elevation });
  });

  cells.forEach((cell) => {
    const neighbors = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const neighbor = byPosition.get(`${cell.properties.row + rowOffset}:${cell.properties.column + columnOffset}`);
        if (neighbor?.elevation !== null && neighbor?.elevation !== undefined) neighbors.push(neighbor.elevation);
      }
    }
    const elevation = cell.properties.staticFeatures.elevationMeters;
    const mean = neighbors.length ? neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length : null;
    const maxDelta = elevation !== null && neighbors.length
      ? Math.max(...neighbors.map((value) => Math.abs(value - elevation)))
      : null;
    cell.properties.staticFeatures.relativeElevationMeters =
      elevation !== null && mean !== null ? Number((elevation - mean).toFixed(1)) : null;
    cell.properties.staticFeatures.localSlopeDegrees =
      maxDelta !== null ? Number((Math.atan(maxDelta / GRID_SIZE_METERS) * 180 / Math.PI).toFixed(1)) : null;
    cell.properties.staticScores.floodBaseline = elevationAdjustedFloodScore(cell.properties.staticFeatures);

    const scores = [
      { score: cell.properties.staticScores.floodBaseline, weight: 0.55 },
      { score: cell.properties.staticScores.drainProximity, weight: 0.15 },
      { score: cell.properties.staticScores.estimatedNoise, weight: 0.15 },
      { score: cell.properties.staticScores.connectivity, weight: 0.15 },
    ].filter((item) => item.score !== null);
    const totalWeight = scores.reduce((sum, item) => sum + item.weight, 0);
    const overall = totalWeight
      ? Number((scores.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight).toFixed(1))
      : null;
    cell.properties.overallStatic = overall;
    cell.properties.heatScoreOverall = overall;
    cell.properties.heatScoreFlood = cell.properties.staticScores.floodBaseline;
  });
}

function inCell(coordinate, minX, minY, maxX, maxY) {
  const [x, y] = lonLatToMercator(coordinate);
  return x >= minX && x < maxX && y >= minY && y < maxY;
}

function featureCenter(feature) {
  return feature.geometry.type === "Point"
    ? feature.geometry.coordinates
    : centerOfCoordinates(feature.geometry.coordinates);
}

function segmentLengthMeters(a, b) {
  const [ax, ay] = lonLatToMercator(a);
  const [bx, by] = lonLatToMercator(b);
  return Math.hypot(bx - ax, by - ay);
}

function roadLengthInCell(roads, minX, minY, maxX, maxY) {
  let length = 0;
  for (const road of roads) {
    const coordinates = road.geometry.coordinates;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const midpoint = [
        (coordinates[index][0] + coordinates[index + 1][0]) / 2,
        (coordinates[index][1] + coordinates[index + 1][1]) / 2,
      ];
      if (inCell(midpoint, minX, minY, maxX, maxY)) {
        length += segmentLengthMeters(coordinates[index], coordinates[index + 1]);
      }
    }
  }
  return Math.round(length);
}

function generateGrid(boundary, layers) {
  const bbox = bboxForPolygon(boundary);
  const [minX, minY] = lonLatToMercator([bbox[0], bbox[1]]);
  const [maxX, maxY] = lonLatToMercator([bbox[2], bbox[3]]);
  const alignedMinX = Math.floor(minX / GRID_SIZE_METERS) * GRID_SIZE_METERS;
  const alignedMinY = Math.floor(minY / GRID_SIZE_METERS) * GRID_SIZE_METERS;
  const columns = Math.ceil((maxX - alignedMinX) / GRID_SIZE_METERS);
  const rows = Math.ceil((maxY - alignedMinY) / GRID_SIZE_METERS);
  const cells = [];
  const majorRoads = layers.roads.filter((road) => road.properties.class === "major");
  const waterEdges = polygonLines(layers.water);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellMinX = alignedMinX + column * GRID_SIZE_METERS;
      const cellMinY = alignedMinY + row * GRID_SIZE_METERS;
      const cellMaxX = cellMinX + GRID_SIZE_METERS;
      const cellMaxY = cellMinY + GRID_SIZE_METERS;
      const center = mercatorToLonLat([(cellMinX + cellMaxX) / 2, (cellMinY + cellMaxY) / 2]);
      if (!booleanPointInPolygon(point(center), boundary)) continue;
      const id = `hsr-grid-${String(row).padStart(2, "0")}-${String(column).padStart(2, "0")}`;
      const ring = [
        mercatorToLonLat([cellMinX, cellMinY]),
        mercatorToLonLat([cellMaxX, cellMinY]),
        mercatorToLonLat([cellMaxX, cellMaxY]),
        mercatorToLonLat([cellMinX, cellMaxY]),
        mercatorToLonLat([cellMinX, cellMinY]),
      ];

      const amenityCount = layers.pois.filter((feature) =>
        inCell(feature.geometry.coordinates, cellMinX, cellMinY, cellMaxX, cellMaxY)).length;
      const commercialCount = layers.pois.filter((feature) =>
        ["restaurant", "cafe", "bar", "pub", "fast_food", "marketplace", "supermarket", "mall"].includes(feature.properties.kind) &&
        inCell(feature.geometry.coordinates, cellMinX, cellMinY, cellMaxX, cellMaxY)).length;
      const busStopCount = layers.pois.filter((feature) =>
        ["bus_stop", "platform", "bus_station"].includes(feature.properties.kind) &&
        inCell(feature.geometry.coordinates, cellMinX, cellMinY, cellMaxX, cellMaxY)).length;
      const constructionCount = layers.buildings.filter((feature) =>
        feature.properties.kind === "construction" &&
        inCell(featureCenter(feature), cellMinX, cellMinY, cellMaxX, cellMaxY)).length;
      const buildingCount = layers.buildings.filter((feature) =>
        inCell(featureCenter(feature), cellMinX, cellMinY, cellMaxX, cellMaxY)).length;
      const distanceToDrainMeters = distanceToLines(center, layers.drains);
      const distanceToFloodPointMeters = distanceToPoints(center, layers.floodPoints);
      const distanceToLakeMeters = distanceToLines(center, waterEdges);
      const distanceToMajorRoadMeters = distanceToLines(center, majorRoads);
      const roadLengthMeters = roadLengthInCell(layers.roads, cellMinX, cellMinY, cellMaxX, cellMaxY);

      const staticFeatures = {
        elevationMeters: null,
        relativeElevationMeters: null,
        localSlopeDegrees: null,
        distanceToDrainMeters,
        distanceToFloodPointMeters,
        distanceToLakeMeters,
        distanceToMajorRoadMeters,
        roadLengthMeters,
        amenityCount,
        commercialCount,
        busStopCount,
        constructionCount,
        buildingCount,
      };
      const staticScores = {
        drainProximity: drainScore(distanceToDrainMeters),
        estimatedNoise: noiseScore(staticFeatures),
        connectivity: connectivityScore(staticFeatures),
        floodBaseline: baselineFloodScore(distanceToFloodPointMeters, distanceToDrainMeters, distanceToLakeMeters),
      };
      const staticAvailable = [
        { score: staticScores.floodBaseline, weight: 0.55 },
        { score: staticScores.drainProximity, weight: 0.15 },
        { score: staticScores.estimatedNoise, weight: 0.15 },
        { score: staticScores.connectivity, weight: 0.15 },
      ].filter((item) => item.score !== null);
      const staticWeight = staticAvailable.reduce((sum, item) => sum + item.weight, 0);
      const overallStatic = staticWeight
        ? Number((staticAvailable.reduce((sum, item) => sum + item.score * item.weight, 0) / staticWeight).toFixed(1))
        : null;

      cells.push({
        type: "Feature",
        properties: {
          id,
          row,
          column,
          sizeMeters: GRID_SIZE_METERS,
          centerLatitude: center[1],
          centerLongitude: center[0],
          staticFeatures,
          staticScores,
          overallStatic,
          heatScoreOverall: overallStatic,
          heatScoreFlood: staticScores.floodBaseline,
          heatScoreDrain: staticScores.drainProximity,
          heatScoreNoise: staticScores.estimatedNoise,
          heatScoreConnectivity: staticScores.connectivity,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
  }
  return cells;
}

function buildSearchIndex(layers) {
  const entries = new Map();
  const add = (id, name, kind, coordinates) => {
    if (!name || !coordinates) return;
    const key = `${name.toLowerCase()}-${kind}`;
    if (!entries.has(key)) {
      entries.set(key, { id, name, kind, longitude: coordinates[0], latitude: coordinates[1] });
    }
  };
  layers.pois.forEach((feature) =>
    add(feature.properties.id, feature.properties.name, feature.properties.kind, feature.geometry.coordinates));
  layers.buildings.forEach((feature) =>
    add(feature.properties.id, feature.properties.name, feature.properties.kind, featureCenter(feature)));
  layers.roads.forEach((feature) =>
    add(feature.properties.id, feature.properties.name, `${feature.properties.kind} road`, featureCenter(feature)));
  layers.green.forEach((feature) =>
    add(feature.properties.id, feature.properties.name, feature.properties.kind, featureCenter(feature)));
  layers.water.forEach((feature) =>
    add(feature.properties.id, feature.properties.name, feature.properties.kind, featureCenter(feature)));
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

console.log("HSR Intelligence Map data ingestion");
console.log(`grid   ${GRID_SIZE_METERS} m × ${GRID_SIZE_METERS} m`);

const boundaryRaw = await cacheFetch(`osm-relation-${BOUNDARY_RELATION_ID}.json`, OSM_API);
const boundary = boundaryFromOsm(boundaryRaw);
const [west, south, east, north] = bboxForPolygon(boundary);
const bbox = `${south},${west},${north},${east}`;

const buildingsQuery = `[out:json][timeout:180];(way["building"](${bbox}););out tags center geom;`;
const contextQuery = `[out:json][timeout:180];(
  way["highway"](${bbox});
  way["natural"="water"](${bbox});
  way["natural"="wetland"](${bbox});
  way["water"](${bbox});
  way["waterway"](${bbox});
  way["landuse"="reservoir"](${bbox});
  way["landuse"~"grass|forest|recreation_ground|meadow"](${bbox});
  way["leisure"~"park|garden|playground|nature_reserve|pitch"](${bbox});
  nwr["amenity"](${bbox});
  nwr["shop"](${bbox});
  nwr["tourism"](${bbox});
  nwr["office"](${bbox});
  nwr["public_transport"](${bbox});
  node["highway"="bus_stop"](${bbox});
);out tags center geom;`;

const [buildingRaw, contextRaw] = await Promise.all([
  fetchOverpass(buildingsQuery, "osm-hsr-buildings.json"),
  fetchOverpass(contextQuery, "osm-hsr-context.json"),
]);
const osm = normalizeOsm(buildingRaw, contextRaw, boundary);

const [drainKml, floodVulnerableKml, floodProneKml, lowLyingKml] = await Promise.all([
  cacheFetch(OPEN_CITY.drains.cache, OPEN_CITY.drains.url, (value) => value),
  cacheFetch(OPEN_CITY.floodVulnerable.cache, OPEN_CITY.floodVulnerable.url, (value) => value),
  cacheFetch(OPEN_CITY.floodProne.cache, OPEN_CITY.floodProne.url, (value) => value),
  cacheFetch(OPEN_CITY.lowLying.cache, OPEN_CITY.lowLying.url, (value) => value),
]);

const parsedDrains = parseKml(drainKml, "BBMP stormwater drains 2022");
const floodSources = [
  parseKml(floodVulnerableKml, "Flood-vulnerable locations"),
  parseKml(floodProneKml, "Flood-prone locations"),
  parseKml(lowLyingKml, "BBMP low-lying areas"),
];

const importedDrains = parsedDrains.lines
  .map((feature) => clipLineFeature(feature, boundary))
  .filter(Boolean);
const osmDrains = osm.water.filter((feature) =>
  feature.geometry.type === "LineString" && feature.properties.class === "drain");
const drains = [...importedDrains, ...osmDrains];
const floodPoints = floodSources.flatMap((source) => source.points).filter((feature) =>
  booleanPointInPolygon(feature, boundary));

const layers = {
  ...osm,
  drains,
  floodPoints,
};
const grid = generateGrid(boundary, layers);
await fetchElevations(grid);
const searchIndex = buildSearchIndex(layers);

const bootstrap = {
  meta: {
    generatedAt: new Date().toISOString(),
    gridSizeMeters: GRID_SIZE_METERS,
    boundarySource: boundary.properties.source,
    boundaryRelationId: BOUNDARY_RELATION_ID,
    osmAttribution: "© OpenStreetMap contributors, ODbL",
    counts: {
      buildings: osm.buildings.length,
      roads: osm.roads.length,
      water: osm.water.length,
      green: osm.green.length,
      drains: drains.length,
      floodPoints: floodPoints.length,
      pois: osm.pois.length,
      gridCells: grid.length,
      searchItems: searchIndex.length,
    },
  },
  boundary,
  buildings: { type: "FeatureCollection", features: osm.buildings },
  roads: { type: "FeatureCollection", features: osm.roads },
  water: { type: "FeatureCollection", features: osm.water },
  green: { type: "FeatureCollection", features: osm.green },
  drains: { type: "FeatureCollection", features: drains },
  floodPoints: { type: "FeatureCollection", features: floodPoints },
  pois: { type: "FeatureCollection", features: osm.pois },
  grid: { type: "FeatureCollection", features: grid },
  searchIndex,
};

await fs.writeFile(OUTPUT, `${JSON.stringify(bootstrap)}\n`);
const sizeMb = Buffer.byteLength(JSON.stringify(bootstrap)) / 1024 / 1024;
console.log(`write  ${path.relative(ROOT, OUTPUT)} (${sizeMb.toFixed(2)} MB)`);
console.log("counts", bootstrap.meta.counts);
