import "server-only";

import type { LocalityId } from "@/lib/constants";
import { LOCALITIES } from "@/lib/constants";
import type { MapBootstrap, StaticIntelligence } from "@/lib/types";
import { getBootstrap, getStaticIntelligence } from "./data";

// ── Intent classification ─────────────────────────────────────────────────────

export type QueryIntent =
  | { kind: "specific-locality"; localityId: LocalityId }
  | { kind: "address"; localityId: LocalityId; addressHint: string }
  | { kind: "broad" };

const LOCALITY_KEYWORDS: Array<{ id: LocalityId; tokens: string[] }> = [
  { id: "hsr",          tokens: ["hsr", "hsr layout", "hsr-layout"] },
  { id: "koramangala",  tokens: ["koramangala", "korama", "koramangla"] },
  { id: "indiranagar",  tokens: ["indiranagar", "indira nagar", "indiranagar"] },
  { id: "whitefield",   tokens: ["whitefield", "white field", "itpl", "epip"] },
  { id: "jpnagar",      tokens: ["jp nagar", "jpnagar", "j.p. nagar", "j.p nagar"] },
  { id: "marathahalli", tokens: ["marathahalli", "marathalli", "maratha halli"] },
  { id: "bellandur",    tokens: ["bellandur", "bellanduru", "bellandur lake"] },
  { id: "hebbal",       tokens: ["hebbal", "manyata", "manyata tech"] },
];

export function classifyIntent(query: string): QueryIntent {
  const lc = query.toLowerCase();

  // Check for locality name in the query
  for (const entry of LOCALITY_KEYWORDS) {
    if (entry.tokens.some((t) => lc.includes(t))) {
      // Could be an address within the locality if the query has more context
      const isAddressLike = /\d|flat|floor|road|street|main|cross|block|sector|phase/i.test(query);
      if (isAddressLike) {
        return { kind: "address", localityId: entry.id, addressHint: query };
      }
      return { kind: "specific-locality", localityId: entry.id };
    }
  }

  return { kind: "broad" };
}

// ── Locality rollup ───────────────────────────────────────────────────────────

export type LocalityRollup = {
  localityId: LocalityId;
  displayName: string;
  description: string;
  center: { latitude: number; longitude: number };
  cellCount: number;
  intelligence: LocalityIntelligenceSummary | null;
};

type LocalityIntelligenceSummary = {
  transit: {
    bmtcRouteCount: number | null;
    nearbyMetroStations: Array<{ name: string; distanceKm: number }>;
  };
  environment: {
    greenCoverPercent: number | null;
    ndviClassification: string | null;
    uhiIntensity: number | null;
  };
  utilities: {
    waterAuthority: string | null;
    supplyFrequency: string | null;
    electricitySaidiHours: number | null;
  };
  civic: {
    wardName: string | null;
    wardPopulation: number | null;
    topComplaintCategories: Array<{ category: string; frequency: string }>;
    crimeNote: string | null;
  };
};

function summariseIntelligence(intel: StaticIntelligence): LocalityIntelligenceSummary {
  return {
    transit: {
      bmtcRouteCount: intel.transit?.bmtc?.routeCount ?? null,
      nearbyMetroStations: (
        intel.transit?.nammaMetro?.nearbyStations ??
        intel.transit?.nammaMetro?.stationsNearHsr?.map((s) => ({
          name: s.name,
          approximateDistanceKm: s.approximateDistanceFromHsrCenterKm,
          status: s.status,
        })) ?? []
      ).map((s) => ({
        name: s.name,
        distanceKm: (s as { approximateDistanceKm?: number; approximateDistanceFromHsrCenterKm?: number }).approximateDistanceKm
          ?? (s as { approximateDistanceFromHsrCenterKm?: number }).approximateDistanceFromHsrCenterKm
          ?? 0,
      })),
    },
    environment: {
      greenCoverPercent: intel.environment?.ndvi?.greenCoverPercent ?? null,
      ndviClassification: intel.environment?.ndvi?.ndviClassification ?? null,
      uhiIntensity: intel.environment?.heatIsland?.uhiIntensityCelsius ?? null,
    },
    utilities: {
      waterAuthority: intel.utilities?.water?.authority ?? null,
      supplyFrequency: intel.utilities?.water?.supplyFrequency ?? null,
      electricitySaidiHours: intel.utilities?.electricity?.saidi2023Hours ?? null,
    },
    civic: {
      wardName: intel.civic?.ward?.bbmpWardName ?? null,
      wardPopulation: intel.civic?.ward?.population2011Census ?? null,
      topComplaintCategories: (intel.civic?.complaints?.topCategories ?? []).slice(0, 3).map((c) => ({
        category: c.category,
        frequency: c.relativeFrequency,
      })),
      crimeNote: intel.civic?.crime?.localityNote ?? intel.civic?.crime?.hsrLayoutNote ?? null,
    },
  };
}

async function buildLocalityRollup(localityId: LocalityId): Promise<LocalityRollup | null> {
  try {
    const [bootstrap, intel] = await Promise.all([
      getBootstrap(localityId),
      getStaticIntelligence(localityId),
    ]);
    const config = LOCALITIES[localityId];
    return {
      localityId,
      displayName: config.displayName,
      description: config.description,
      center: config.center,
      cellCount: bootstrap.grid.features.length,
      intelligence: intel ? summariseIntelligence(intel) : null,
    };
  } catch {
    return null;
  }
}

// ── Address resolution via search index ──────────────────────────────────────

type AddressMatch = {
  name: string;
  kind: string;
  localityId: string;
  latitude: number;
  longitude: number;
};

async function resolveAddress(
  localityId: LocalityId,
  hint: string,
): Promise<AddressMatch | null> {
  try {
    const bootstrap: MapBootstrap = await getBootstrap(localityId);
    const lc = hint.toLowerCase();
    const tokens = lc.split(/\s+/).filter((t) => t.length > 2);
    const scored = bootstrap.searchIndex
      .filter((item) => item.addressMatch || item.kind === "place")
      .map((item) => {
        const name = item.name.toLowerCase();
        const matches = tokens.filter((t) => name.includes(t)).length;
        return { item, matches };
      })
      .filter(({ matches }) => matches > 0)
      .sort((a, b) => b.matches - a.matches);

    if (scored.length === 0) return null;
    const best = scored[0].item;
    return {
      name: best.name,
      kind: best.kind,
      localityId: best.localityId ?? localityId,
      latitude: best.latitude,
      longitude: best.longitude,
    };
  } catch {
    return null;
  }
}

// ── Main context assembly ─────────────────────────────────────────────────────

export type AssistantContext = {
  intent: QueryIntent;
  localities: LocalityRollup[];
  addressMatch: AddressMatch | null;
  // Populated from the system prompt template
  systemPrompt: string;
  // The enriched user turn sent to the model
  userTurn: string;
};

const SYSTEM_PROMPT = `You are the UrbanLens intelligence assistant for Bengaluru, India.

UrbanLens analyses 100 m × 100 m grid cells across Bengaluru localities using open government, satellite, and OSM data.

STRICT RULES — violating any of these is a critical error:
1. Use ONLY the locality data provided in this conversation. Never invent a number, distance, name, or claim not in the provided JSON.
2. If data is unavailable or null, say so explicitly — never guess or extrapolate.
3. Never score, rate, or rank individual apartments, buildings, streets, or residents. Only locality-level and cell-level analysis is in scope.
4. Crime data is Bengaluru city-wide from NCRB. Never associate crime with a specific locality or cell. If asked about crime safety, state that only city-wide data is available.
5. Be concise: answer in 3–6 sentences unless the question clearly needs more detail.
6. If a question is out of scope for the data provided, say so honestly — do not guess.`;

export async function assembleContext(query: string): Promise<AssistantContext> {
  const intent = classifyIntent(query);

  let localityIds: LocalityId[];
  if (intent.kind === "broad") {
    localityIds = Object.keys(LOCALITIES) as LocalityId[];
  } else {
    localityIds = [intent.localityId];
  }

  const rollups = (
    await Promise.all(localityIds.map(buildLocalityRollup))
  ).filter((r): r is LocalityRollup => r !== null);

  let addressMatch: AddressMatch | null = null;
  if (intent.kind === "address") {
    addressMatch = await resolveAddress(intent.localityId, intent.addressHint);
  }

  const dataSection = JSON.stringify(
    {
      localities: rollups,
      ...(addressMatch ? { addressMatch } : {}),
    },
    null,
    2,
  );

  const userTurn = `LOCALITY DATA (use this only — do not add outside facts):\n${dataSection}\n\nQUESTION: ${query}`;

  return { intent, localities: rollups, addressMatch, systemPrompt: SYSTEM_PROMPT, userTurn };
}
