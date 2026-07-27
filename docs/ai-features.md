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

### How it is generated — live on demand (no pre-generation required)

When a user opens a cell that has no pre-generated summary, the intelligence panel automatically calls `GET /api/ai/cell-summary/:cellId`. The panel shows a "Generating summary…" spinner while the request is in-flight. The endpoint:

1. Checks an in-process memory overlay first (instant if a previous visitor already triggered generation in this server process).
2. Falls back to the file-based pre-generated map (`public/data/{localityId}-cell-summaries.json`) if it exists.
3. If neither cache has the cell, calls Gemini live with the same grounding prompt used by the offline script.
4. Stores the result in the in-process overlay so the next request for that cell in the same process returns immediately.

**Rate-limit handling**: if Gemini returns 429, the panel shows "AI summary is limited per user on the free tier — try another area shortly." — a calm, intentional-looking state, not an error.

### Optional pre-generation (batch warm-up)

The batch script still exists as an optional warm-up tool:

```
npm run ai:summaries -- --locality hsr
npm run ai:summaries:all                  # all 8 localities
```

Pre-generating means zero LLM latency for cells already in the file. But it is no longer required — any cell with no prior generation works correctly through the live path alone.

The grounding prompt (used by both paths):
> "Use ONLY the data in the JSON below. Do not add facts from outside this data. Never invent a number or claim not present in the provided JSON."

### Storage

Pre-generated summaries: `public/data/{localityId}-cell-summaries.json` — a flat `{ cellId: summaryText }` map.  
Live-generated summaries: in-process memory overlay (`liveSummaryOverlay` in `src/server/data.ts`), reset on server restart.  
The cell metrics API (`GET /api/cells/:id/metrics`) still reads the file-based map and returns `aiSummary` if present; the intelligence panel fetches live summaries separately via `GET /api/ai/cell-summary/:cellId`.

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

Per-session, in-memory: 20 queries per session per rolling hour. Sessions are identified by a client-generated opaque string stored in `sessionStorage`. When the session limit or the Gemini free-tier quota is hit, the server returns a normal `reply` string (as an assistant message) rather than an error response, so the chat thread remains intact and the input stays enabled. The user can read the message and try again — the UI never locks or displays a raw error. The session counter resets when the server process restarts.

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
