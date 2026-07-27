# AI features

UrbanLens includes two AI-powered features built on top of the existing ingested locality data. Both are optional — the application works fully without an API key. When no key is set, every AI surface shows a clean placeholder, never a raw error.

## Design principles

1. **Grounding over generation.** Every AI call provides the data inline and instructs the model explicitly to use only that data, never invent numbers, and never extrapolate. If a field is null, the summary must say it is unavailable.
2. **One provider module.** `src/server/ai-provider.ts` is the only file that calls the Gemini REST API. Switching model or provider requires changing one file.
3. **Key in env, never in code.** `GEMINI_API_KEY` is read from the environment. It never appears in any committed file.
4. **No individual scoring.** Neither feature scores, rates, or draws conclusions about individual apartments, buildings, or residents. Analysis is cell-level (100 m × 100 m) or locality-level.
5. **Crime context is city-wide.** If asked about crime, the assistant states that only NCRB city-wide data is available and does not associate crime with any locality or cell.

## Feature 1: per-cell AI summary

### What it does

Each 100 m × 100 m analysis cell can carry a pre-generated 2–4 sentence natural-language synthesis that describes the strongest and weakest scored dimensions for that cell, based on its static features and scores. The summary appears in the intelligence panel below the composite score.

### How it is generated

```
npm run ai:summaries -- --locality hsr
npm run ai:summaries:all                  # all 8 localities
```

The script reads the locality bootstrap artifact and static intelligence file, builds a compact context object per cell, and calls Gemini 1.5 Flash with a grounding prompt. It rate-limits to 1 request/1.1 s (free-tier safe), saves incrementally after each cell, and skips already-generated cells unless `--force` is passed.

The grounding prompt:
> "Use ONLY the data in the JSON below. Do not add facts from outside this data. Never invent a number or claim not present in the provided JSON."

### Storage

Output: `public/data/{localityId}-cell-summaries.json` — a flat `{ cellId: summaryText }` map. The cell metrics API (`GET /api/cells/:id/metrics`) reads this at request time and attaches `aiSummary` to the `AnalysisCell` response.

### Context sent to the model

For each cell:
- `cellId`, `locality`, `sizeMeters`
- `staticScores` — the 8 scored dimensions (0–10 scale)
- `features` — distances to healthcare, schools, transit, markets, parks, drains, flood points, roads; building/bus/school/park counts
- `localityIntelligence` — nearby metro stations, NDVI green cover classification, water supply frequency (from the static intelligence file)
- A `note` field explicitly states: "Air quality and weather are fetched live and are not included in this static summary."

### What is NOT sent

- Live AQI or weather (these are request-time and would make summaries stale immediately)
- Any personally identifying information
- Anything not present in the existing ingested artifacts

---

## Feature 2: home-screen intelligence assistant

### What it does

A conversational interface that answers natural-language questions about Bengaluru localities. Accessible via the "Ask AI" button in the map credit bar. The assistant is a chat panel with message history, a typing indicator, and rate-limit / no-key states.

### How it works

1. **Intent classification** (`src/server/ai-retrieval.ts`) — the query is classified:
   - `specific-locality` — mentions one locality by name or alias
   - `address` — mentions a locality AND contains numeric/street tokens
   - `broad` — no locality-specific signal
2. **Context retrieval** — only the needed data is fetched:
   - `specific-locality` / `address`: one locality rollup
   - `broad`: all 8 locality rollups
3. **Address resolution** — for `address` intent, the existing search index is queried to find a named match for the address hint.
4. **Grounded prompt assembly** — locality rollups are serialised as JSON and passed inline. The system prompt contains the same explicit grounding rules as the cell summary feature.
5. **LLM call** — `generateAiText` with `maxTokens: 500`, `temperature: 0.25`.

### Rate limiting

Per-session, in-memory: 20 queries per session per rolling hour. Sessions are identified by a client-generated opaque string stored in `sessionStorage`. The server returns `rateLimited: true` in the JSON body (not a hard 429 body that would break the UI) with a friendly message. The counter resets when the server process restarts.

### Context sent to the model per locality rollup

```
{
  localityId, displayName, description, center, cellCount,
  intelligence: {
    transit: { bmtcRouteCount, nearbyMetroStations },
    environment: { greenCoverPercent, ndviClassification, uhiIntensity },
    utilities: { waterAuthority, supplyFrequency, electricitySaidiHours },
    civic: { wardName, wardPopulation, topComplaintCategories, crimeNote }
  }
}
```

Intelligence is `null` when the static intelligence file has not been authored for a locality — the model is instructed to say "unavailable" rather than guess.

### System prompt (verbatim)

```
You are the UrbanLens intelligence assistant for Bengaluru, India.

UrbanLens analyses 100 m × 100 m grid cells across Bengaluru localities using
open government, satellite, and OSM data.

STRICT RULES — violating any of these is a critical error:
1. Use ONLY the locality data provided in this conversation. Never invent a
   number, distance, name, or claim not in the provided JSON.
2. If data is unavailable or null, say so explicitly — never guess or extrapolate.
3. Never score, rate, or rank individual apartments, buildings, streets, or
   residents. Only locality-level and cell-level analysis is in scope.
4. Crime data is Bengaluru city-wide from NCRB. Never associate crime with a
   specific locality or cell. If asked about crime safety, state that only
   city-wide data is available.
5. Be concise: answer in 3–6 sentences unless the question clearly needs more.
6. If a question is out of scope for the data provided, say so honestly —
   do not guess.
```

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | _(unset)_ | Gemini REST API key. When absent, AI features are gracefully disabled. |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Model override for both features. |

## Testing

- `src/server/ai-provider.test.ts` — 12 unit tests with mocked `fetch`. Covers: no-key path, successful extraction, prompt config forwarding, model env override, non-2xx, Zod mismatch, network error, whitespace trim, empty string.
- `src/server/ai-retrieval.test.ts` — 15 unit tests with mocked data layer. Covers: all intent kinds, intelligence summarisation, null intelligence, broad mode fetching all localities, graceful failure when a locality file is missing, system prompt content, cell count.
