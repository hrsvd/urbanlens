import { NextResponse } from "next/server";
import type { Feature, LineString, MultiLineString } from "geojson";
import type { LocalityId } from "@/lib/constants";
import { LOCALITIES } from "@/lib/constants";
import { getAllBootstraps } from "@/server/data";
import type { MapBootstrap, MapFeatureProperties, SearchItem } from "@/lib/types";

// Tokens that never help disambiguate a cell inside Bengaluru localities.
const STOPWORDS = new Set([
  "hsr",
  "layout",
  "bengaluru",
  "bangalore",
  "karnataka",
  "india",
  "near",
  "opp",
  "opposite",
  "beside",
  "behind",
  "the",
  "and",
  "no",
  "number",
  "flat",
  "floor",
  "apartment",
  "apt",
  "pin",
  "pincode",
  "landmark",
  // Locality names as stopwords so "Koramangala 5th Block" doesn't get
  // dominated by the locality token and still finds "5th Block" precisely.
  "koramangala",
  "indiranagar",
  "whitefield",
  "jpnagar",
  "jp",
  "nagar",
  "marathahalli",
  "bellandur",
  "hebbal",
]);

function flatten(query: string) {
  return query
    .replace(/[\n\r\t,;/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-IN");
}

function tokenize(flat: string): string[] {
  return flat
    .split(/[\s.\-#()]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !/^\d{6}$/.test(token));
}

function normalizeOrdinal(token: string): string {
  return token.replace(/^(\d+)(st|nd|rd|th)$/, "$1");
}

function itemTokens(item: SearchItem): Set<string> {
  return new Set(tokenize(flatten(`${item.name} ${item.kind}`)));
}

type Corpus = {
  items: SearchItem[];
  tokenSets: Set<string>[];
  idf: Map<string, number>;
};

// Combined cross-locality corpus. Invalidated when the bootstrap set changes.
let corpusCache: { key: Map<LocalityId, MapBootstrap>; corpus: Corpus } | null = null;

function buildCombinedCorpus(bootstraps: Map<LocalityId, MapBootstrap>): Corpus {
  if (corpusCache && corpusCache.key === bootstraps) return corpusCache.corpus;

  // Merge all locality search indexes, tagging each item with its locality.
  const items: SearchItem[] = [];
  for (const [localityId, data] of bootstraps) {
    const localityName = LOCALITIES[localityId as LocalityId]?.displayName ?? localityId;
    for (const item of data.searchIndex) {
      items.push({ ...item, localityId, localityName });
    }
  }

  const tokenSets = items.map(itemTokens);
  const df = new Map<string, number>();
  for (const set of tokenSets) {
    for (const token of set) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const total = items.length || 1;
  const idf = new Map<string, number>();
  for (const [token, count] of df) idf.set(token, Math.log(total / (1 + count)) + 0.4);

  const corpus = { items, tokenSets, idf };
  corpusCache = { key: bootstraps, corpus };
  return corpus;
}

function tokenSpecificity(token: string, idf: Map<string, number>): number {
  const base = idf.get(token) ?? Math.log(1401) + 0.4;
  const numericBoost = /\d/.test(token) ? 1.6 : 1;
  return base * numericBoost;
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

type MatchQuality = "exact" | "prefix" | "fuzzy";

function itemMatches(queryToken: string, tokens: Set<string>): MatchQuality | null {
  const normalQ = normalizeOrdinal(queryToken);
  if (tokens.has(queryToken)) return "exact";
  for (const token of tokens) {
    if (normalizeOrdinal(token) === normalQ) return "exact";
  }
  if (queryToken.length < 3) return null;
  for (const token of tokens) {
    const normalT = normalizeOrdinal(token);
    if (normalT.startsWith(normalQ) || normalQ.startsWith(normalT)) return "prefix";
    if (token.startsWith(queryToken) || queryToken.startsWith(token)) return "prefix";
  }
  if (queryToken.length >= 4) {
    for (const token of tokens) {
      if (token.length >= 3 && levenshtein(queryToken, token) <= 1) return "fuzzy";
    }
  }
  return null;
}

const MATCH_WEIGHT: Record<MatchQuality, number> = {
  exact: 1.0,
  prefix: 0.85,
  fuzzy: 0.65,
};

type Ranked = SearchItem & { matchScore: number; matchedTokens: number };

function rankItems(queryTokens: string[], corpus: Corpus): Ranked[] {
  const ranked: Ranked[] = [];
  const specificity = queryTokens.map((token) => tokenSpecificity(token, corpus.idf));
  const maxPossible = specificity.reduce((sum, value) => sum + value, 0) || 1;

  corpus.items.forEach((item, index) => {
    const tokens = corpus.tokenSets[index];
    let score = 0;
    let matched = 0;
    queryTokens.forEach((queryToken, tokenIndex) => {
      const quality = itemMatches(queryToken, tokens);
      if (quality) {
        score += specificity[tokenIndex] * MATCH_WEIGHT[quality];
        matched += 1;
      }
    });
    if (matched === 0) return;
    const coverage = matched / queryTokens.length;
    ranked.push({
      ...item,
      matchedTokens: matched,
      matchScore: Number(((score / maxPossible) * 0.7 + coverage * 0.3).toFixed(4)),
    });
  });

  return ranked.sort(
    (a, b) => b.matchScore - a.matchScore || b.matchedTokens - a.matchedTokens || a.name.localeCompare(b.name),
  );
}

// --- Coordinate search -------------------------------------------------------
function parseCoordinate(raw: string): { lat: number; lon: number } | null {
  const cleaned = raw.replace(/[°'"]/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const a = parseFloat(match[1]);
  const b = parseFloat(match[2]);
  const inBangaloreLat = (v: number) => v >= 12.5 && v <= 13.5;
  const inBangaloreLon = (v: number) => v >= 77.2 && v <= 78.0;
  if (inBangaloreLat(a) && inBangaloreLon(b)) return { lat: a, lon: b };
  if (inBangaloreLat(b) && inBangaloreLon(a)) return { lat: b, lon: a };
  return null;
}

function nearestGridCell(bootstraps: Map<LocalityId, MapBootstrap>, lat: number, lon: number): SearchItem | null {
  let bestItem: SearchItem | null = null;
  let bestDistSq = Infinity;

  for (const [localityId, data] of bootstraps) {
    const localityName = LOCALITIES[localityId as LocalityId]?.displayName ?? localityId;
    for (const cell of data.grid.features) {
      const dLat = cell.properties.centerLatitude - lat;
      const dLon = cell.properties.centerLongitude - lon;
      const distSq = dLat * dLat + dLon * dLon;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestItem = {
          id: cell.properties.id,
          name: `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`,
          kind: "coordinate",
          latitude: cell.properties.centerLatitude,
          longitude: cell.properties.centerLongitude,
          localityId,
          localityName,
          note: `Nearest analysis cell · ${cell.properties.id}`,
        };
      }
    }
  }
  return bestItem;
}

// --- Road intersection resolution -------------------------------------------
const EARTH_RADIUS = 6_378_137;
function merc([lon, lat]: number[]): [number, number] {
  return [
    (EARTH_RADIUS * lon * Math.PI) / 180,
    EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}

function roadCoordinateRuns(feature: Feature<LineString | MultiLineString, MapFeatureProperties>): number[][][] {
  return feature.geometry.type === "MultiLineString"
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];
}

function segmentCrossing(a1: number[], a2: number[], b1: number[], b2: number[]): number[] | null {
  const [ax, ay] = merc(a1);
  const [bx, by] = merc(a2);
  const [cx, cy] = merc(b1);
  const [dx, dy] = merc(b2);
  const r = [bx - ax, by - ay];
  const s = [dx - cx, dy - cy];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((cx - ax) * s[1] - (cy - ay) * s[0]) / denom;
  const u = ((cx - ax) * r[1] - (cy - ay) * r[0]) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a1[0] + (a2[0] - a1[0]) * t, a1[1] + (a2[1] - a1[1]) * t];
}

function roadCrossing(
  roadsA: Feature<LineString | MultiLineString, MapFeatureProperties>[],
  roadsB: Feature<LineString | MultiLineString, MapFeatureProperties>[],
): number[] | null {
  for (const fa of roadsA) {
    for (const runA of roadCoordinateRuns(fa)) {
      for (let i = 0; i < runA.length - 1; i += 1) {
        for (const fb of roadsB) {
          for (const runB of roadCoordinateRuns(fb)) {
            for (let j = 0; j < runB.length - 1; j += 1) {
              const crossing = segmentCrossing(runA[i], runA[i + 1], runB[j], runB[j + 1]);
              if (crossing) return crossing;
            }
          }
        }
      }
    }
  }
  return null;
}

function roadsByName(data: MapBootstrap, name: string) {
  const target = name.toLocaleLowerCase("en-IN");
  return data.roads.features.filter((feature) => (feature.properties.name ?? "").toLocaleLowerCase("en-IN") === target);
}

function intersectionResult(ranked: Ranked[], bootstraps: Map<LocalityId, MapBootstrap>): SearchItem | null {
  const seen = new Set<string>();
  const roads: Ranked[] = [];
  for (const item of ranked) {
    if (!item.kind.includes("road") || item.matchedTokens < 2) continue;
    const name = item.name.toLocaleLowerCase("en-IN");
    if (seen.has(name)) continue;
    seen.add(name);
    roads.push(item);
    if (roads.length >= 6) break;
  }
  if (roads.length < 2) return null;

  for (let i = 0; i < roads.length; i += 1) {
    for (let j = i + 1; j < roads.length; j += 1) {
      // Both roads must be in the same locality for an intersection to exist.
      if (roads[i].localityId !== roads[j].localityId) continue;
      const localityId = roads[i].localityId as LocalityId;
      const data = bootstraps.get(localityId);
      if (!data) continue;
      const crossing = roadCrossing(roadsByName(data, roads[i].name), roadsByName(data, roads[j].name));
      if (crossing) {
        const localityName = LOCALITIES[localityId]?.displayName ?? localityId;
        return {
          id: `intersection-${roads[i].id}-${roads[j].id}`,
          name: `${roads[i].name} × ${roads[j].name}`,
          kind: "road intersection",
          longitude: crossing[0],
          latitude: crossing[1],
          localityId,
          localityName,
          matchedTokens: roads[i].matchedTokens + roads[j].matchedTokens,
          note: "Resolved from where the two named roads cross",
        };
      }
    }
  }
  return null;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const flat = flatten(raw);
  if (flat.length < 2) return NextResponse.json({ results: [] });

  const bootstraps = await getAllBootstraps();

  const coord = parseCoordinate(raw.trim());
  if (coord) {
    const cell = nearestGridCell(bootstraps, coord.lat, coord.lon);
    const results = cell ? [cell] : [];
    return NextResponse.json({ results, query: raw.trim(), coordinate: true, scope: "all Bengaluru localities" });
  }

  const corpus = buildCombinedCorpus(bootstraps);
  const queryTokens = tokenize(flat);
  if (!queryTokens.length) return NextResponse.json({ results: [], scope: "all Bengaluru localities" });

  const ranked = rankItems(queryTokens, corpus);
  const results: SearchItem[] = [];

  if (queryTokens.length >= 3) {
    const intersection = intersectionResult(ranked, bootstraps);
    if (intersection) results.push(intersection);
  }

  for (const item of ranked) {
    if (results.length >= 8) break;
    results.push(item);
  }

  const top = ranked[0];
  const runnerUp = ranked[1];
  const ambiguous =
    results[0]?.kind !== "road intersection" &&
    Boolean(top && runnerUp) &&
    runnerUp.matchScore >= top.matchScore * 0.82;

  return NextResponse.json({
    results,
    query: raw.trim(),
    tokens: queryTokens,
    ambiguous,
    scope: "all Bengaluru localities",
    provider: "Locally ingested OpenStreetMap index · fuzzy match",
  });
}
