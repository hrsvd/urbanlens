# Architecture

## Decision summary

The MVP is a single Next.js application backed by a pre-generated local geospatial artifact. This is intentionally simpler than a web/API/PostGIS monorepo while the scope is one 3.5 km-wide locality.

### MapLibre over a Three.js scene

MapLibre GL JS is the geographic renderer and interaction engine. Building extrusions, roads, grid polygons, water, vegetation, drain lines, flood points, and selection are all WGS84-backed map layers. No unrelated 2D map sits beneath decorative 3D geometry.

An empty local style is used instead of a public raster tile server. The HSR object is rendered from the checked-in normalized artifact, avoiding production abuse of `tile.openstreetmap.org`.

### Local artifact over runtime Overpass

`scripts/ingest-data.mjs` performs expensive and failure-prone work offline:

- boundary assembly;
- Overpass download and normalization;
- KML parsing;
- locality clipping;
- coordinate projection;
- cell generation;
- nearest-feature distances;
- elevation sampling;
- static-score features;
- search-index creation.

The browser receives normalized GeoJSON and never sees an oversized raw Overpass response. Vercel request handlers never perform large spatial operations.

### No PostGIS yet

For 706 cells and one locality, a database would add operational cost without improving the first release. The provider contracts and cell IDs leave a direct migration path to PostGIS when multiple localities or time series justify it.

### Projected square grid

Longitude/latitude coordinates are transformed to Web Mercator metres. The grid origin is aligned to the 100 m projected lattice. Full squares whose centres fall inside the HSR polygon are retained, including boundary-edge cells. This preserves a consistent unit of analysis.

### Static and dynamic evidence

Static evidence:

- OSM geometry;
- BBMP/OpenCity drain lines;
- BBMP/KSRSAC flood points;
- Copernicus DEM elevation;
- derived distance, density, connectivity, and noise features.

Dynamic evidence:

- Open-Meteo weather;
- Open-Meteo air-quality/CAMS.

Dynamic requests are server-side, Zod-validated, retried once, rounded to 0.025° coordinate buckets, and cached for 15 or 45 minutes. Several HSR cells therefore reuse the same regional model request.

### Partial failure

Air and weather are fetched with `Promise.allSettled`. A failure in one provider does not remove the static map or other metrics. The unavailable metric returns `null`, an explanation, zero confidence, and no evidence. It is omitted from the overall score.

## Runtime flow

```text
page
 ├─ GET /api/map/bootstrap
 │    └─ memoized read(public/data/hsr-bootstrap.json)
 ├─ MapLibre map
 │    ├─ click → coordinateToCell
 │    ├─ selected-cell source update
 │    └─ layer visibility / heat surface state
 ├─ local search
 │    └─ GET /api/search?q=
 └─ selected cell
      └─ GET /api/cells/:id/metrics
           ├─ static cell feature lookup
           ├─ cached air/weather adapters
           └─ transparent scoring engine
```

## Key folders

```text
src/app/                 routes, pages, API handlers
src/components/map/      map, search, controls, panel, loading, help
src/lib/                 types, grid helpers, scoring, source ledger, state
src/server/              local artifact, external adapters, metric assembly
scripts/                 ingestion and browser inspection
public/data/             generated runtime artifact
docs/                    architecture, verification, scoring, deployment
e2e/                     Playwright journeys
```

## Performance posture

- no runtime Overpass;
- one self-contained bootstrap request;
- MapLibre WebGL rendering;
- fixed label cap;
- regional dynamic-request bucketing;
- server and client query caches;
- stale request abort in local search;
- progressive loader while geometry is parsed and uploaded;
- map layers are toggled with style visibility, not recreated.

The current 7.1 MB uncompressed GeoJSON is acceptable for an MVP and compresses substantially over HTTP, but PMTiles with zoom-based generalized layers is the clear next step.

## Privacy and safety boundary

The system has no authentication, tracking, resident reporting, saved places, speed-test collection, or personal movement history. Search terms are handled by the application’s local OSM index. Every conclusion is attached to a cell, never a person or property.
