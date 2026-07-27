# Architecture

## Decision summary

UrbanLens is a single Next.js application backed by pre-generated, per-locality geospatial artifacts. This is intentionally simpler than a web/API/PostGIS monorepo while the scope is a handful of Bengaluru localities served from static files.

### MapLibre over a Three.js scene

MapLibre GL JS is the geographic renderer and interaction engine. Building extrusions, roads, grid polygons, water, vegetation, drain lines, flood points, and selection are all WGS84-backed map layers.

An empty local style is used instead of a public raster tile server. Each locality is rendered from its checked-in normalized artifact, avoiding production abuse of `tile.openstreetmap.org`.

### Local artifact per locality over runtime Overpass

`scripts/ingest-data.mjs --locality <id>` performs expensive and failure-prone work offline:

- boundary assembly;
- Overpass download and normalization;
- KML parsing;
- locality clipping;
- coordinate projection;
- cell generation;
- nearest-feature distances;
- elevation sampling;
- static-score features (environmental, infrastructure and livability access);
- search-index creation.

Each locality produces `public/data/{localityId}-bootstrap.json`. `scripts/ingest-all.mjs` runs all localities sequentially.

`scripts/augment-data.mjs --locality <id>` is a network-free companion that re-derives only the livability access features onto an existing artifact. The refresh strategy per data category is documented in [docs/data-strategy.md](data-strategy.md).

The browser receives normalized GeoJSON and never sees an oversized raw Overpass response. Vercel request handlers never perform large spatial operations.

### Map architecture: single map with lazy per-locality loading

Rather than one combined global map or multiple separate route-scoped maps, the active locality is held in Zustand (`activeLocality: LocalityId`). The in-body locality switcher updates this state, which:

1. triggers a new TanStack Query fetch (`queryKey: ["map-bootstrap", activeLocality]`) for the new locality's bootstrap JSON;
2. re-centers MapLibre's camera on the new locality center;
3. replaces all map sources (buildings, roads, grid, drains, flood, landmarks) from the new payload;
4. clears any selected cell and closes the intelligence panel.

Previously loaded locality bootstraps remain in the TanStack Query cache, so switching back is instant. The map DOM, WebGL context, and all static sources (empty base style) are never destroyed.

### Data storage: static JSON files, no database

For the current set of localities, a database would add operational cost without improving the first release. Each locality is a self-contained file:

- `public/data/{localityId}-bootstrap.json` — geometry, grid cells, and static features (ingested)
- `public/data/{localityId}-static-intelligence.json` — ward, metro, NDVI, UHI, civic signals (hand-authored per locality as data becomes available)

Server-side, module-level `Map<LocalityId, Promise<MapBootstrap>>` caches avoid re-reading files across requests in the same process. The provider contracts and cell IDs (`{localityId}-grid-{row:02}-{col:02}`) leave a direct migration path to PostGIS when time series or finer resolution justify it.

### Cell ID namespace

Cell IDs encode their locality: `{localityId}-grid-{row:02}-{col:02}` (e.g. `hsr-grid-14-21`, `koramangala-grid-07-03`). The server derives the locality from any cell ID by splitting on `-grid-` and looking up the result in the LOCALITIES registry. This means any API endpoint receiving a cell ID can load the correct bootstrap without an explicit locality parameter.

### Projected square grid

Longitude/latitude coordinates are transformed to Web Mercator metres. The grid origin is aligned to the 100 m projected lattice. Full squares whose centres fall inside the locality polygon are retained, including boundary-edge cells. This preserves a consistent unit of analysis across localities.

### Static and dynamic evidence

Static evidence:

- OSM geometry;
- BBMP/OpenCity drain lines;
- BBMP/KSRSAC flood points (coverage varies by locality);
- Copernicus DEM elevation;
- derived distance, density, connectivity, and noise features;
- livability access features — schools, healthcare, public transport (incl. Namma Metro), daily-needs retail, parks/green space, and a low-confidence police-proximity proxy.

Dynamic evidence:

- Open-Meteo weather;
- Open-Meteo air-quality/CAMS.

Dynamic requests are server-side, Zod-validated, retried once, rounded to 0.025° coordinate buckets, and cached for 15 or 45 minutes.

### Partial failure

Air and weather are fetched with `Promise.allSettled`. A failure in one provider does not remove the static map or other metrics. The unavailable metric returns `null`, an explanation, zero confidence, and no evidence. It is omitted from the overall score. Missing static intelligence for a locality (no `{localityId}-static-intelligence.json`) is handled gracefully — the file returns `null` and all intelligence-derived metrics show unavailable.

## Runtime flow

```text
page
 ├─ GET /api/map/bootstrap?locality=hsr
 │    └─ memoized read(public/data/hsr-bootstrap.json)
 ├─ LocalitySwitcher (body)
 │    └─ setActiveLocality → new queryKey → new bootstrap fetch
 ├─ MapLibre map
 │    ├─ click → coordinateToCell
 │    ├─ selected-cell source update
 │    └─ layer visibility / heat surface state
 ├─ cross-locality search
 │    └─ GET /api/search?q=
 │         └─ getAllBootstraps() → merged corpus, results tagged with localityId
 └─ selected cell
      └─ GET /api/cells/:id/metrics
           ├─ localityForCell(cellId) → load correct bootstrap + intelligence
           ├─ static cell feature lookup
           ├─ cached air/weather adapters
           └─ transparent scoring engine
```

## Key folders

```text
src/app/                 routes, pages, API handlers
src/components/map/      map, search, controls, panel, loading, help, locality-switcher
src/lib/                 types, grid helpers, scoring, source ledger, state, constants (locality registry)
src/server/              local artifact loader, external adapters, metric assembly
scripts/                 per-locality ingestion, all-locality runner, browser inspection
public/data/             generated runtime artifacts ({localityId}-bootstrap.json, etc.)
docs/                    architecture, verification, scoring, deployment, data-strategy
e2e/                     Playwright journeys
```

## Performance posture

- no runtime Overpass;
- one self-contained bootstrap request per locality (cached in TanStack Query);
- MapLibre WebGL rendering;
- fixed label cap;
- regional dynamic-request bucketing;
- server module-level and client TanStack Query caches;
- stale request abort in local search;
- progressive loader while geometry is parsed and uploaded;
- map layers toggled with style visibility, not recreated on locality switch.

The current uncompressed GeoJSON per locality is acceptable for an MVP and compresses substantially over HTTP. PMTiles with zoom-based generalized layers is the next performance step.

## Privacy and safety boundary

The system has no authentication, tracking, resident reporting, saved places, speed-test collection, or personal movement history. Search terms are handled by the application's local OSM index. Every conclusion is attached to a cell, never a person or property.
