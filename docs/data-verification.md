# Data verification

Tested: **25 July 2026**  
Test coordinate: HSR Layout centre, `12.9116, 77.6389`

Every used source below was called from the development environment and its returned fields were inspected. Static source responses are cached only for ingestion; runtime adapters add timeouts, validation, caching, retry, and graceful partial failure.

## OpenStreetMap boundary API

**Source:** OpenStreetMap API  
**Endpoint:** `https://api.openstreetmap.org/api/0.6/relation/17168010/full.json`  
**Sample request:** relation `17168010`, full member geometry  
**Observed response fields:** `elements[].type`, `id`, `lat`, `lon`, `nodes`, relation `members`, `tags`  
**HSR coverage:** Relation name `HSR Layout`; 9 member ways; assembled bbox `77.6236224,12.901132,77.661076,12.926266`  
**Boundary source tag:** `https://bda.karnataka.gov.in/30/e-auction/en`  
**Update frequency:** Community edits  
**License:** ODbL 1.0  
**Limitations:** Locality relation, not the municipal ward also named HSR Layout; crowdsourced geometry  
**Used in scoring:** No; defines scope and clipping

Result: **accepted**.

## OpenStreetMap Overpass

**Source:** OpenStreetMap contributors through Overpass API  
**Endpoints:** `https://overpass-api.de/api/interpreter`, fallback `https://overpass.kumi.systems/api/interpreter`  
**Sample request:** building ways and separately queried road/water/land-use/POI categories inside the boundary bbox  
**Observed response fields:** `elements`, `type`, `id`, `tags`, `center`, `geometry`  
**HSR coverage after clipping:** 10,810 buildings, 1,845 roads, 55 water features, 70 green polygons, 1,140 named POIs  
**Update frequency:** Community edits; manual versioned import in this MVP  
**License:** ODbL 1.0  
**Limitations:** Completeness and height tags vary; relation multipolygons are not yet fully normalized  
**Used in scoring:** Yes—roads, land use, amenities, water, mapped drains, construction

Result: **accepted for offline ingestion only**. It is never called on page interaction.

## OpenCity / BBMP stormwater drains

**Source:** Bengaluru Stormwater Drains Maps 2022  
**Endpoint:** OpenCity CKAN package API plus the combined KML resource  
**Package:** `fc97e05c-c54b-44e9-8d98-7663ee887922`  
**Observed metadata:** primary, secondary, tertiary, and combined KML resources; provider BBMP  
**Observed response fields:** KML `Placemark`, `name`, `LineString`, `coordinates`  
**HSR coverage:** 108 imported drain line features after clipping, plus 32 OSM drain/waterway lines  
**Update frequency:** Static 2022 map; versioned import  
**License:** Dataset page terms with provider attribution retained  
**Limitations:** Does not establish present capacity, blockage, maintenance, or hydraulic performance  
**Used in scoring:** Yes—distance context and flood susceptibility

Result: **accepted with explicit age/condition caveat**.

## OpenCity / BBMP / KSRSAC flood locations

**Source:** Flooding Locations in Bengaluru Urban  
**Endpoint:** OpenCity CKAN package `b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c` and three KML resources  
**Observed metadata:** vulnerable-to-flooding, flood-prone, and BBMP low-lying layers; package updated 27 November 2025  
**Observed response fields:** KML placemarks, names, point coordinates  
**HSR coverage:** 5 points inside the selected HSR locality—4 vulnerable-location points and 1 flood-prone point  
**Update frequency:** Varies by resource; versioned import  
**License:** OpenCity package marks `Other (Public Domain)`  
**Limitations:** Known points are not a complete inventory; source dates differ; proximity cannot predict an event  
**Used in scoring:** Yes

Result: **accepted as documented historical/susceptibility evidence**.

## Open-Meteo Weather

**Source:** Open-Meteo Weather Forecast API  
**Endpoint:** `https://api.open-meteo.com/v1/forecast`  
**Sample request fields:** current temperature/precipitation/rain/showers/weather code; hourly precipitation probability and precipitation; daily precipitation sum  
**Observed response:** returned coordinate `12.899824, 77.65667`, elevation `883 m`, timezone `Asia/Kolkata`, current precipitation `0.20 mm`, and daily precipitation arrays  
**HSR coverage:** Provider-selected model grid covering HSR  
**Update frequency:** Model-dependent; application cache 15 minutes  
**License:** CC BY 4.0 with Open-Meteo attribution  
**Limitations:** Model-grid context, not a 100 m rain gauge; forecast uncertainty  
**Used in scoring:** Yes—rainfall and temporary flood context

Result: **accepted as modelled, dynamic context**.

## Open-Meteo Air Quality

**Source:** Open-Meteo Air Quality / CAMS global atmospheric forecast  
**Endpoint:** `https://air-quality-api.open-meteo.com/v1/air-quality`  
**Sample request fields:** PM10, PM2.5, carbon monoxide, nitrogen dioxide, sulphur dioxide, ozone, US AQI  
**Observed response:** returned model coordinate `12.900002, 77.600006`; PM2.5 `6.2 µg/m³`, PM10 `10.2 µg/m³`, US AQI `52` at the tested time  
**HSR coverage:** Global CAMS grid covering HSR  
**Update frequency:** Global model every 12 hours; application cache 45 minutes  
**License:** CC BY 4.0 with attribution  
**Limitations:** Approximately 45 km global grid for Bengaluru; not street-level or indoor air quality  
**Used in scoring:** Yes, with 55% geographic confidence

Result: **accepted with regional-resolution disclosure**.

## Open-Meteo Elevation / Copernicus DEM

**Source:** Copernicus DEM GLO-90 via Open-Meteo Elevation API  
**Endpoint:** `https://api.open-meteo.com/v1/elevation`  
**Sample request:** batches of at most 100 WGS84 cell-centre coordinates  
**Observed response fields:** `elevation[]`, one value per coordinate  
**HSR coverage:** 706/706 cell centres; observed range `872–913 m`; derived relative range `-9.5–8.0 m`; maximum neighbour slope proxy `8.5°`  
**Update frequency:** Static DEM; versioned import  
**License:** Copernicus and Open-Meteo attribution required  
**Limitations:** 90 m source grid cannot resolve property-scale or micro-drainage features  
**Used in scoring:** Yes—relative elevation and local slope

Result: **accepted with rate-limited, resumable ingestion**.

## Nominatim

**Source:** Public OpenStreetMap Nominatim service  
**Endpoint tested:** `https://nominatim.openstreetmap.org/search`  
**Observed result:** Access denied from the development environment even with an application User-Agent  
**Policy review:** Public policy prohibits client-side autocomplete and requires low-rate, identifiable, cached use  
**HSR coverage:** Not relied upon  
**Used in scoring:** No

Result: **rejected for runtime search**. The application searches its locally ingested HSR OSM index, with 280 ms debounce and stale-request abort. The environment variable is retained for a future compliant proxy/provider adapter.

## Network quality

TRAI/provider and public-catalogue candidates were considered, but no verified reusable dataset was accepted as representative at 100 m HSR cell resolution. Provider marketing coverage is not equivalent to measured performance.

Result: **disabled**. UI states “Network quality data unavailable. Community measurements planned.” It is excluded from the score.

## Property price/rent

No legitimate open, reusable, adequately documented HSR dataset was accepted. Prohibited-platform scraping was not attempted.

Result: **disabled** and excluded.

## Production checks

- adapter timeouts: 8 seconds;
- retry: one retry for dynamic APIs;
- dynamic partial failure: `Promise.allSettled`;
- response validation: Zod;
- weather cache: 15 minutes;
- air-quality cache: 45 minutes;
- static geometry: local, versioned artifact;
- ingestion: resumable caches and fallback Overpass endpoint.
