# Deployment

## Recommended: Vercel

This project fits Vercel because all heavy geospatial preparation is complete before deployment.

### 1. Prepare the artifacts

```bash
npm ci
# Ingest all localities (or ingest individually)
npm run data:ingest:all
npm test
npm run build
```

Review changes to each `public/data/{localityId}-bootstrap.json`, including livability point counts. Do not run ingestion from a Vercel function. To refresh only the OSM-derived livability features without re-downloading, run `node scripts/augment-data.mjs --locality <id>` offline. See [docs/data-strategy.md](data-strategy.md) for the per-category refresh cadence.

### 2. Configure

Required production variable:

```env
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
```

Optional endpoint overrides are documented in `.env.example`. No secrets are required.

### 3. Deploy

Import the repository into Vercel, retain the Next.js preset, and use:

- install: `npm ci`
- build: `npm run build`
- output: managed by Next.js

All generated `public/data/*.json` files must be present in the deployment. The bootstrap API reads them at request time with a module-level in-process cache. Dynamic cell metrics use 15-minute edge/server revalidation and tolerate partial upstream failure.

## Static-data update workflow

```text
manual or scheduled GitHub Action
      ↓
npm ci && npm run data:ingest:all   (or --locality <id> for targeted update)
      ↓
validate counts, licenses, source metadata, map screenshot per locality
      ↓
tests + production build
      ↓
review artifact diffs
      ↓
deploy
```

Overpass ingestion should be manual or infrequent and must respect public service limits.

## Scaling path

The per-locality bootstrap JSON files are acceptable for multi-locality MVP validation. Before expanding further:

1. produce PMTiles or vector tiles per locality;
2. generalize geometry by zoom;
3. move cell features and time series to Postgres/PostGIS;
4. put static tiles in object storage/CDN;
5. keep upstream environmental calls bucketed and cached;
6. retain the same public cell and evidence contracts.

## Operational checks

After deployment:

```text
GET /api/health
GET /api/map/bootstrap?locality=hsr
GET /api/map/bootstrap?locality=koramangala
GET /api/cells/hsr-grid-14-21/metrics
GET /api/search?q=park
```

Then verify:

- locality switcher is visible and switches correctly;
- 3D building extrusion and WebGL context per locality;
- pan, zoom, pitch, and rotate;
- center-map cell selection;
- dynamic provider fallback;
- source links;
- mobile bottom sheet;
- browser console;
- attribution visibility;
- compressed bootstrap transfer size per locality.

## Licensing

The interactive map must retain visible `© OpenStreetMap contributors` attribution linked to the OSM copyright page. Open-Meteo, Copernicus, BBMP/OpenCity, and derived-method attribution remains visible in the data ledger and metric evidence.
