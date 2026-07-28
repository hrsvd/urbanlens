#!/usr/bin/env node
/**
 * Pre-generate natural-language AI summaries for every cell in a locality.
 *
 * Summaries are stored in public/data/{localityId}-cell-summaries.json as
 * { "cellId": "summaryText" }. The cell metrics API reads this file and
 * attaches it to the AnalysisCell response as aiSummary.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-ai-summaries.mjs --locality hsr
 *   node --env-file=.env.local scripts/generate-ai-summaries.mjs --locality all
 *   node --env-file=.env.local scripts/generate-ai-summaries.mjs --locality hsr --force
 *
 * Requires GEMINI_API_KEY and GEMINI_MODEL to be set (e.g. in .env.local).
 * Run with Node 20.11+ for --env-file support.
 *
 * Rate limiting: 1 request/second by default (safe for Gemini free tier).
 * ~260 cells per locality ≈ ~5 minutes per locality.
 *
 * If a summary file already exists, existing entries are kept and only
 * missing cells are filled unless --force is passed.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LOCALITIES = [
  "hsr", "koramangala", "indiranagar", "whitefield",
  "jpnagar", "marathahalli", "bellandur", "hebbal",
];

const RATE_LIMIT_MS = 1100; // 1.1 s between requests
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim();

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const localityArg = args[args.indexOf("--locality") + 1];
const force = args.includes("--force");

if (!localityArg) {
  console.error("Usage: node scripts/generate-ai-summaries.mjs --locality <id|all> [--force]");
  process.exit(1);
}

const targets = localityArg === "all" ? LOCALITIES : [localityArg];

// ── API key check ─────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey || !GEMINI_MODEL) {
  console.error(
    "\nError: GEMINI_API_KEY and GEMINI_MODEL must both be set.\n" +
    "Add them to .env.local and run with:\n" +
    "  node --env-file=.env.local scripts/generate-ai-summaries.mjs --locality <id>\n",
  );
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadBootstrap(localityId) {
  const filePath = path.join(ROOT, "public", "data", `${localityId}-bootstrap.json`);
  if (!existsSync(filePath)) throw new Error(`Bootstrap not found: ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function loadIntelligence(localityId) {
  const filePath = path.join(ROOT, "public", "data", `${localityId}-static-intelligence.json`);
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(readFileSync(filePath, "utf8")); } catch { return null; }
}

function loadExisting(localityId) {
  const filePath = path.join(ROOT, "public", "data", `${localityId}-cell-summaries.json`);
  if (!existsSync(filePath)) return {};
  try { return JSON.parse(readFileSync(filePath, "utf8")); } catch { return {}; }
}

function saveSummaries(localityId, summaries) {
  const filePath = path.join(ROOT, "public", "data", `${localityId}-cell-summaries.json`);
  writeFileSync(filePath, JSON.stringify(summaries, null, 2), "utf8");
}

/**
 * Builds a compact context object for a cell.
 * Uses only static data (bootstrap + intelligence); dynamic AQI/weather
 * are live and excluded from pre-generated summaries (noted in the prompt).
 */
function buildCellContext(cell, intelligence, localityConfig) {
  const sf = cell.properties.staticFeatures ?? {};
  const ss = cell.properties.staticScores ?? {};

  return {
    cellId: cell.properties.id,
    locality: localityConfig.displayName,
    sizeMeters: cell.properties.sizeMeters ?? 100,
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
      distanceToDrainMeters: sf.distanceToDrainMeters ?? null,
      distanceToFloodPointMeters: sf.distanceToFloodPointMeters ?? null,
      distanceToLakeMeters: sf.distanceToLakeMeters ?? null,
      distanceToMajorRoadMeters: sf.distanceToMajorRoadMeters ?? null,
      roadLengthMeters: sf.roadLengthMeters ?? null,
      buildingCount: sf.buildingCount ?? null,
      busStopCount: sf.busStopCount ?? null,
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
    localityIntelligence: intelligence ? {
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
    } : null,
    note: "Air quality and weather are fetched live and are not included in this static summary.",
  };
}

function buildPrompt(context) {
  return `You are a data synthesizer for UrbanLens, an evidence-led geographic intelligence tool for Bengaluru, India.

Your task: write a 2–4 sentence plain-language summary of what the data says about this 100 m × 100 m analysis cell.

STRICT RULES:
1. Use ONLY the data in the JSON below. Do not add facts, distances, or claims from outside this data.
2. Never invent a number or claim not present in the provided JSON.
3. If a value is null, say it is "unavailable" — do not omit or guess.
4. Do not give housing recommendations or verdicts. State data-driven observations only.
5. Scores are on a 0–10 scale (higher = better). Mention at least the strongest and weakest scored dimension.
6. Keep it to 2–4 sentences, factual, and concise. No bullet points.

CELL DATA:
${JSON.stringify(context, null, 2)}

Write the plain-language summary:`;
}

async function callGemini(prompt) {
  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 200, temperature: 0.15 },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

// ── Main ──────────────────────────────────────────────────────────────────────
for (const localityId of targets) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`generate-ai-summaries  ${localityId}`);
  console.log("─".repeat(60));

  let bootstrap;
  try { bootstrap = loadBootstrap(localityId); }
  catch (err) { console.error(`  skip: ${err.message}`); continue; }

  const intelligence = loadIntelligence(localityId);
  const existing = force ? {} : loadExisting(localityId);
  const localityConfig = { displayName: localityId, ...bootstrap.meta };
  // Use displayName from bootstrap meta if available
  if (bootstrap.meta?.localityId) localityConfig.displayName = bootstrap.meta.localityId;

  const cells = bootstrap.grid?.features ?? [];
  console.log(`  ${cells.length} cells · ${Object.keys(existing).length} already generated`);

  const toProcess = cells.filter((c) => !existing[c.properties.id]);
  console.log(`  ${toProcess.length} cells to process`);

  if (toProcess.length === 0) {
    console.log("  All cells already have summaries. Use --force to regenerate.");
    continue;
  }

  const summaries = { ...existing };
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const cell = toProcess[i];
    const cellId = cell.properties.id;
    process.stdout.write(`  [${i + 1}/${toProcess.length}] ${cellId} … `);

    try {
      const context = buildCellContext(cell, intelligence, localityConfig);
      const prompt = buildPrompt(context);
      const summary = await callGemini(prompt);
      summaries[cellId] = summary;
      ok++;
      process.stdout.write("ok\n");
      saveSummaries(localityId, summaries); // save incrementally
    } catch (err) {
      failed++;
      process.stdout.write(`FAILED: ${err.message}\n`);
    }

    if (i < toProcess.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n  Done: ${ok} generated, ${failed} failed`);
  console.log(`  Saved to public/data/${localityId}-cell-summaries.json`);
}
