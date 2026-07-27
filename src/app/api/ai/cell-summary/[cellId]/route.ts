import { NextResponse } from "next/server";
import type { LocalityId } from "@/lib/constants";
import { LOCALITIES } from "@/lib/constants";
import type { AnalysisCellFeature, StaticIntelligence } from "@/lib/types";
import {
  getBootstrap,
  getCell,
  getCellSummaries,
  getLiveSummary,
  getStaticIntelligence,
  localityForCell,
  setCachedSummary,
} from "@/server/data";
import { generateAiResult, isAiEnabled } from "@/server/ai-provider";

// ── Context builder ───────────────────────────────────────────────────────────
// Mirrors the logic in scripts/generate-ai-summaries.mjs so offline-generated
// and live-generated summaries use identical grounding contexts.

function buildCellContext(
  cell: AnalysisCellFeature,
  intelligence: StaticIntelligence | null,
  localityId: LocalityId,
) {
  const sf = cell.properties.staticFeatures;
  const ss = cell.properties.staticScores;
  const displayName = LOCALITIES[localityId]?.displayName ?? localityId;

  return {
    cellId: cell.properties.id,
    locality: displayName,
    sizeMeters: cell.properties.sizeMeters,
    staticScores: {
      floodBaseline: ss.floodBaseline ?? null,
      connectivity: ss.connectivity ?? null,
      education: ss.education ?? null,
      healthcare: ss.healthcare ?? null,
      transit: ss.transit ?? null,
      dailyNeeds: ss.dailyNeeds ?? null,
      greenSpace: ss.greenSpace ?? null,
      drainProximity: ss.drainProximity ?? null,
    },
    features: {
      distanceToDrainMeters: sf.distanceToDrainMeters,
      distanceToFloodPointMeters: sf.distanceToFloodPointMeters,
      distanceToLakeMeters: sf.distanceToLakeMeters,
      distanceToMajorRoadMeters: sf.distanceToMajorRoadMeters,
      roadLengthMeters: sf.roadLengthMeters,
      buildingCount: sf.buildingCount,
      busStopCount: sf.busStopCount,
      distanceToSchoolMeters: sf.distanceToSchoolMeters ?? null,
      schoolCount: sf.schoolCount ?? null,
      distanceToHealthcareMeters: sf.distanceToHealthcareMeters ?? null,
      healthcareCount: sf.healthcareCount ?? null,
      distanceToTransitMeters: sf.distanceToTransitMeters ?? null,
      distanceToMetroStationMeters: sf.distanceToMetroStationMeters ?? null,
      distanceToMarketMeters: sf.distanceToMarketMeters ?? null,
      dailyNeedsCount: sf.dailyNeedsCount ?? null,
      distanceToParkMeters: sf.distanceToParkMeters ?? null,
      parkCount: sf.parkCount ?? null,
    },
    localityIntelligence: intelligence
      ? {
          metro: intelligence.transit?.nammaMetro?.nearbyStations?.slice(0, 2) ?? null,
          ndvi: intelligence.environment?.ndvi
            ? {
                greenCoverPercent: intelligence.environment.ndvi.greenCoverPercent,
                classification: intelligence.environment.ndvi.ndviClassification,
              }
            : null,
          water: intelligence.utilities?.water
            ? {
                authority: intelligence.utilities.water.authority,
                supplyFrequency: intelligence.utilities.water.supplyFrequency,
              }
            : null,
        }
      : null,
    note: "Air quality and weather are fetched live and are not included in this static summary.",
  };
}

const PROMPT_PREFIX = `You are a data synthesizer for UrbanLens, an evidence-led geographic intelligence tool for Bengaluru, India.

Your task: write a 2–4 sentence plain-language summary of what the data says about this 100 m × 100 m analysis cell.

STRICT RULES:
1. Use ONLY the data in the JSON below. Do not add facts, distances, or claims from outside this data.
2. Never invent a number or claim not present in the provided JSON.
3. If a value is null, say it is "unavailable" — do not omit or guess.
4. Do not give housing recommendations or verdicts. State data-driven observations only.
5. Scores are on a 0–10 scale (higher = better). Mention at least the strongest and weakest scored dimension.
6. Keep it to 2–4 sentences, factual, and concise. No bullet points.

CELL DATA:
`;

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cellId: string }> },
) {
  const { cellId } = await params;

  if (!isAiEnabled()) {
    return NextResponse.json({ summary: null, disabled: true });
  }

  // 1. Check in-process live overlay (fastest — no I/O)
  const live = getLiveSummary(cellId);
  if (live) {
    return NextResponse.json({ summary: live, cached: true });
  }

  // 2. Check file-based pre-generated summaries
  const localityId = localityForCell(cellId);
  const [cell, intelligence, fileSummaries] = await Promise.all([
    getCell(cellId),
    getStaticIntelligence(localityId),
    getCellSummaries(localityId),
  ]);

  if (!cell) {
    return NextResponse.json({ error: "Unknown cell" }, { status: 404 });
  }

  const fileSummary = fileSummaries[cellId] ?? null;
  if (fileSummary) {
    setCachedSummary(cellId, fileSummary); // warm up live overlay for next request
    return NextResponse.json({ summary: fileSummary, cached: true });
  }

  // 3. Generate live
  await getBootstrap(localityId); // ensure bootstrap is loaded (needed by getCellSummaries)
  const context = buildCellContext(cell, intelligence, localityId);
  const prompt = `${PROMPT_PREFIX}${JSON.stringify(context, null, 2)}\n\nWrite the plain-language summary:`;

  const result = await generateAiResult(prompt, { maxTokens: 200, temperature: 0.15 });

  if (!result.ok) {
    if (result.reason === "rate-limited") {
      return NextResponse.json({ summary: null, rateLimited: true }, { status: 429 });
    }
    return NextResponse.json({ summary: null, error: true }, { status: 502 });
  }

  // Cache in overlay so repeated requests in this process skip the LLM
  setCachedSummary(cellId, result.text);

  return NextResponse.json({ summary: result.text, cached: false });
}
