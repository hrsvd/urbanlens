# Data loading strategy

## Decision

**Hybrid, category-aware, offline-first, per-locality.** Every slow- or batch-changing signal is baked into per-locality committed `public/data/{localityId}-bootstrap.json` artifacts at ingest time. Only genuinely fast-changing environmental context (air quality, weather) is fetched at request time, server-side, from Open-Meteo with coordinate bucketing and short caches. No Overpass, KML, DEM, or elevation call ever runs inside a Vercel request handler.

This keeps the "no database, static artifact" architecture ([docs/architecture.md](architecture.md)) intact and extends it cleanly to multi-locality support.

## Why

- **Most of the map is slow-changing.** Building footprints, roads, drains, flood-evidence points, DEM/elevation, and the OSM amenity points that back schools/healthcare/transit/retail/parks/police signals change on the order of weeks-to-months. Fetching them per user would be wasteful, slow, rate-limit hostile, and would put large spatial work on request handlers.
- **A tiny slice is genuinely fast-changing.** AQI and weather move hour-to-hour. These are fetched server-side, Zod-validated, retried once, rounded to ~0.025° buckets so many cells share one regional model request, and cached (weather 15 min, air quality 45 min).
- **Crime/electricity are batch-published or unavailable at this resolution.** They are deliberately *not* wired into scoring, so they impose no refresh requirement.
- **Determinism and auditability.** Committed artifacts mean the deployed map is reviewable as a source diff, reproducible, and independent of upstream uptime.
- **Multi-locality isolation.** Each locality has its own file. Adding a new locality requires only a new ingestion run; removing or updating one locality does not affect others.

## Refresh cadence per category

| Category | Source | Change rate | Where it lives | Refresh mechanism |
|---|---|---|---|---|
| Boundary relations | OSM API | Rare | Artifact per locality | Manual/scheduled `data:ingest --locality <id>` |
| Buildings, roads, water, land use | OSM Overpass | Slow (weeks) | Artifact per locality | Manual/scheduled `data:ingest --locality <id>` |
| Drains, flood-evidence points | BBMP/OpenCity KML | Static/versioned | Artifact per locality | Manual `data:ingest --locality <id>` |
| Elevation / slope | Copernicus DEM (Open-Meteo) | Static | Artifact per locality | Manual `data:ingest --locality <id>` |
| Schools, healthcare, transit, retail, parks, police proximity | OSM Overpass | Slow (weeks) | Artifact per locality | `data:ingest`, or offline `augment-data --locality <id>` |
| Air quality (PM2.5, AQI) | Open-Meteo / CAMS | Fast (hours) | Request-time | 45-minute server cache |
| Weather / rainfall | Open-Meteo | Fast (hours) | Request-time | 15-minute server cache |
| Static intelligence (metro, NDVI, UHI, civic) | Hand-authored per locality | Rare | `{localityId}-static-intelligence.json` | Manual update |

## Ingestion vs. augmentation

Two offline entry points produce the same artifact fields:

- **`node scripts/ingest-data.mjs --locality <id>`** — the full pipeline: download boundary, Overpass, KML, DEM; clip; generate the grid; and derive every static feature.
- **`node scripts/augment-data.mjs --locality <id>`** — a network-free pass that re-derives only the livability access features onto an existing artifact, using the cached raw OSM context when present.
- **`npm run data:ingest:all`** — runs the full pipeline for all 8 localities sequentially.

## Static intelligence files

`public/data/{localityId}-static-intelligence.json` is hand-authored per locality and holds signals that require manual data collection: ward numbers, BMTC route context, Namma Metro stations, NDVI, UHI, BWSSB water context, civic complaint patterns, crime context, internet reliability.

For the initial release, this file is only fully populated for HSR Layout. Other localities have stub files that explicitly mark these signals as unavailable. This is the honest default: better to show "unavailable" than to silently omit or invent locality-specific intelligence.

## Recommended operational cadence

- **Static geometry + livability per locality:** re-run `data:ingest --locality <id>` on a **manual or scheduled (e.g. monthly) GitHub Action**, review the artifact diff, run tests, then deploy.
- **All localities:** use `npm run data:ingest:all` for a full refresh. This takes significant time (one locality per sequential run). Consider running per-locality GitHub Actions in parallel for production automation.
- **AQI/weather:** no operational action; the server cache and edge revalidation handle freshness within the request path.

## What is intentionally not fetched live

- Any request-time Overpass/KML/DEM call inside a serverless handler — prohibited.
- Nominatim autocomplete — rejected (policy + environment); search is fully local.
- Crime, electricity reliability, network quality, property price — no legitimately geocoded, reusable dataset exists at 100 m locality resolution, so these stay explicitly unavailable rather than being estimated. See [docs/data-verification.md](data-verification.md).
