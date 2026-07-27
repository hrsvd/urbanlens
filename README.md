# UrbanLens Bengaluru

An evidence-led, interactive 3D geographic intelligence tool for **major Bengaluru localities**.

UrbanLens renders real, locally ingested city surfaces — OSM building footprints, roads, parks, water, named places, BBMP/OpenCity drains and flood evidence — then divides each locality into projected **100 m × 100 m** analysis cells. Selecting a cell opens environmental and infrastructure indicators with confidence, provenance, resolution, and limitations.

It never scores an individual apartment, building, street, resident, or property.

## Localities covered

| Locality | OSM Relation | Approx. size |
|---|---|---|
| HSR Layout | 17168010 | ~3.5 km wide |
| Koramangala | 19884595 | — |
| Indiranagar | 19883335 | — |
| Whitefield | 19883364 | — |
| JP Nagar | 17205864 | — |
| Marathahalli | 19884550 | — |
| Bellandur | 19884585 | — |
| Hebbal | 19883365 | — |

## What is implemented

- Local MapLibre 3D map per locality: pan, zoom, pitch, rotate, orbit, reset, fly-to
- Per-locality OSM boundary relation as clipping mask
- Real building footprints with mapped height/level data
- Roads, parks, water, drains, flood points, landmarks, POIs, and local place labels
- Projected, configurable 100 m square grid with click-to-cell lookup
- In-body locality switcher — switch between localities without a page reload
- Score-driven, semi-transparent selection overlay on a diverging red↔green scale
- Full-grid metric surface modes and a non-binary legend
- Full/multi-part **address-aware** cross-locality search: tokenised, specificity-ranked, with road-intersection resolution and a disambiguation list; results tagged with locality name
- Responsive desktop intelligence panel and mobile bottom sheet with per-metric breakdown (sub-score · weight · contribution · confidence)
- Cached Open-Meteo air-quality and weather adapters with schema validation and graceful partial failure
- Imported BBMP/OpenCity stormwater-drain and flood-vulnerability KML (coverage varies by locality; gaps shown honestly)
- Copernicus DEM GLO-90 samples for relative elevation and local-slope features
- Livability access signals derived from OSM — schools, healthcare, public transport (incl. Namma Metro), daily-needs retail, parks/green space, and a low-confidence police-proximity proxy
- Explainable scoring with missing-data re-normalisation
- Explicitly unavailable network quality, electricity reliability, and hyperlocal crime instead of invented scores
- Distinctive typography (Sora display, IBM Plex Sans body, IBM Plex Mono tabular readouts) and Framer Motion micro-interactions
- `/methodology`, `/data-sources`, `/about`, and `/api-docs`
- Unit, integration-style normalization, desktop E2E, and mobile E2E tests

## Architecture

```text
Offline / versioned ingestion (per locality)

OSM API + Overpass        OpenCity / BBMP KML        Open-Meteo Elevation
        │                         │                           │
        └──────── download → validate → normalize ───────────┘
                                      │
                    clip to locality OSM boundary relation
                                      │
                  derive 100 m grid + static cell features
                                      │
              public/data/{localityId}-bootstrap.json

Runtime

Browser ── GET /api/map/bootstrap?locality=hsr ── locality artifact
   │
   ├── LocalitySwitcher (body) → activeLocality → new bootstrap query
   ├── MapLibre WebGL: real geometry + 3D extrusion + cell layers
   ├── GET /api/search?q= ───────── cross-locality OSM name index
   └── GET /api/cells/:id/metrics
                │
                ├── locality derived from cell ID prefix
                ├── static drain/flood/elevation/road/amenity features
                └── bucketed + cached Open-Meteo air/weather requests
                              │
                       transparent score engine
```

Architectural decisions and tradeoffs are documented in [docs/architecture.md](docs/architecture.md).

## Technology

- Next.js App Router, React, TypeScript
- MapLibre GL JS
- TanStack Query
- Zustand
- Framer Motion
- Turf spatial predicates
- Zod upstream-response validation
- Vitest, Testing Library, Playwright

Static geospatial work happens during ingestion. Vercel request handlers read pre-generated artifacts and never perform large spatial operations.

## Local setup

Requirements:

- Node.js 20.11 or newer
- npm
- Internet access for the one-time ingestion and dynamic environmental APIs

```bash
npm install
copy .env.example .env.local
# Ingest all localities (sequential, takes a while)
npm run data:ingest:all
# Or ingest a single locality
node scripts/ingest-data.mjs --locality hsr
npm run dev
```

Open `http://localhost:3000`.

The repository already contains a generated HSR artifact. Re-run ingestion when source geometry or the grid configuration changes. New localities need a first-run ingestion before they appear.

## Environment variables

No secret keys are required.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Metadata/deployment origin |
| `MAP_DATA_MODE` | `local` | Documents the local artifact mode |
| `GRID_SIZE_METERS` | `100` | Ingestion-time square cell size |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com` | Weather adapter |
| `OPEN_METEO_AIR_QUALITY_BASE_URL` | `https://air-quality-api.open-meteo.com` | Air-quality adapter |
| `NOMINATIM_BASE_URL` | public endpoint | Reserved adapter configuration |
| `OVERPASS_BASE_URL` | official endpoint | Offline OSM ingestion |

## Data ingestion

```bash
# Ingest all localities sequentially
npm run data:ingest:all

# Ingest a single locality
node scripts/ingest-data.mjs --locality hsr
node scripts/ingest-data.mjs --locality koramangala
node scripts/ingest-data.mjs --locality indiranagar
# ... etc

# Re-derive only the livability access features onto an existing artifact
node scripts/augment-data.mjs --locality hsr
```

The ingestion script for each locality:

1. downloads and assembles the OSM locality boundary relation;
2. fetches buildings and context from Overpass with fallback/retry;
3. clips geometry to the locality polygon;
4. downloads OpenCity drain and flood KML;
5. samples the 90 m Copernicus DEM through the Open-Meteo Elevation API with persisted, rate-limited batches;
6. generates metre-aligned 100 m cells;
7. derives distance, density, connectivity, noise-proxy, elevation, baseline flood, and livability access features;
8. writes `public/data/{localityId}-bootstrap.json`.

Raw downloads are cached under `scripts/cache/` and intentionally ignored by Git.

The data-loading strategy is documented in [docs/data-strategy.md](docs/data-strategy.md).

## Development and test commands

```bash
npm run dev          # development server
npm run typecheck    # TypeScript
npx eslint .         # lint
npm test             # Vitest
npm run test:e2e     # desktop + mobile Playwright
npm run build        # optimized production bundle
npm run start        # serve the production bundle
node scripts/inspect-ui.mjs  # headless runtime/console inspection
```

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/map/bootstrap?locality=` | Complete normalized map payload for a locality |
| `GET /api/map/buildings` | Building footprint collection |
| `GET /api/map/roads` | Road collection |
| `GET /api/map/landmarks` | Named POIs for the active locality |
| `GET /api/map/grid` | Analysis cells and static features |
| `GET /api/cells/:cellId` | Cell geometry/static evidence |
| `GET /api/cells/:cellId/metrics` | Full evidence and scored metrics |
| `GET /api/search?q=` | Cross-locality OSM name index |
| `GET /api/data-sources` | Source ledger |
| `GET /api/health` | Service health |

See `/api-docs` in the running application.

## Scoring summary

The configurable default weights (sum to 1.0) are:

```ts
{
  floodSusceptibility: 0.16,
  airQuality: 0.14,
  healthcare: 0.10,
  transit: 0.09,
  connectivity: 0.08,
  education: 0.08,
  dailyNeeds: 0.07,
  greenSpace: 0.07,
  drainProximity: 0.06,
  estimatedNoise: 0.06,
  rainfall: 0.05,
  safetyProxy: 0.04,
}
```

Unavailable metrics are omitted and available weights re-normalised. Evidence coverage and confidence only modestly adjust the visible rating. The cell panel shows each metric's sub-score, weight, contribution and confidence. See [docs/scoring-methodology.md](docs/scoring-methodology.md).

## Deployment

The simplest deployment is Vercel:

1. push this repository to GitHub;
2. import it into Vercel as a Next.js project;
3. set `NEXT_PUBLIC_APP_URL` to the production origin;
4. keep the generated `public/data/{localityId}-bootstrap.json` files in the deployment;
5. deploy with the standard `npm run build`.

Do not run Overpass or KML ingestion inside a request handler. Regenerate artifacts locally or in a manually triggered/scheduled GitHub Action, review the source diff, then deploy.

Full notes: [docs/deployment.md](docs/deployment.md).

## Known limitations

- Air quality is regional CAMS model output (~45 km grid), not a street sensor.
- Weather is model-grid context, not a 100 m observation.
- The 90 m DEM cannot represent basement, kerb, building-pad, or drain-condition details.
- BBMP/OpenCity drain and flood KML coverage varies by locality; sparse coverage is shown explicitly.
- The noise indicator is a low-confidence road/activity proxy, not measured decibels.
- Livability signals (schools, healthcare, transit, retail, parks) are OSM-derived **access proxies**, not quality ratings; OSM completeness varies by locality.
- Police proximity is a low-confidence safety proxy, **not a crime rate**. Karnataka crime data is city/district-level only.
- Network quality, electricity reliability, and property pricing are disabled because no adequate per-cell dataset was verified.
- Search is cross-locality and address-aware. The public Nominatim endpoint is not used at runtime (policy forbids client autocomplete).
- Static intelligence (NDVI, UHI, metro, water, civic) is currently only populated for HSR Layout; other localities show unavailable for those signals.

## Data verification

Every upstream used or rejected was exercised on **25 July 2026**. Requests, response fields, coverage, licenses, limitations, and fallbacks are recorded in [docs/data-verification.md](docs/data-verification.md).
