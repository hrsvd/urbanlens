# Deployment

## Recommended: Vercel

This project fits Vercel because all heavy geospatial preparation is complete before deployment.

### 1. Prepare the artifact

```bash
npm ci
npm run data:ingest
npm test
npm run build
```

Review changes to `public/data/hsr-bootstrap.json`. Do not run ingestion from a Vercel function.

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

The checked-in GeoJSON is served through the local bootstrap API with long CDN cache headers. Dynamic cell metrics use 15-minute edge/server revalidation and tolerate partial upstream failure.

## Static-data update workflow

```text
manual or scheduled GitHub Action
      ↓
npm ci && npm run data:ingest
      ↓
validate counts, licenses, source metadata, and map screenshot
      ↓
tests + production build
      ↓
review artifact diff
      ↓
deploy
```

Overpass ingestion should be manual or infrequent and must respect public service limits.

## Scaling path

The current 7.1 MB uncompressed artifact is appropriate for HSR-only MVP validation. Before adding another locality:

1. produce PMTiles or vector tiles;
2. generalize geometry by zoom;
3. move cell features and time series to Postgres/PostGIS;
4. put static tiles in object storage/CDN;
5. keep upstream environmental calls bucketed and cached;
6. retain the same public cell and evidence contracts.

## Operational checks

After deployment:

```text
GET /api/health
GET /api/map/bootstrap
GET /api/cells/hsr-grid-14-21/metrics
GET /api/search?q=park
```

Then verify:

- 3D building extrusion and WebGL context;
- pan, zoom, pitch, and rotate;
- center-map cell selection;
- dynamic provider fallback;
- source links;
- mobile bottom sheet;
- browser console;
- attribution visibility;
- compressed bootstrap transfer size.

## Licensing

The interactive map must retain visible `© OpenStreetMap contributors` attribution linked to the OSM copyright page. Open-Meteo, Copernicus, BBMP/OpenCity, and derived-method attribution remains visible in the data ledger and metric evidence.
