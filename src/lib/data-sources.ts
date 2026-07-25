import { SOURCE_URLS } from "./constants";

export type DataSourceRecord = {
  id: string;
  dataset: string;
  provider: string;
  sourceUrl: string;
  purpose: string;
  dataType: string;
  resolution: string;
  lastImported: string;
  license: string;
  classification: "official" | "open-data" | "modelled" | "derived";
  limitations: string;
  usedInScoring: boolean;
  refresh: string;
};

export const DATA_SOURCES: DataSourceRecord[] = [
  {
    id: "osm",
    dataset: "HSR boundary, buildings, roads, places, land use and waterways",
    provider: "OpenStreetMap contributors",
    sourceUrl: SOURCE_URLS.osm,
    purpose: "Local 3D geometry, search, amenities, transport, water and land-use features",
    dataType: "Open collaborative geodata",
    resolution: "Individual mapped objects; completeness varies",
    lastImported: "Generated with npm run data:ingest",
    license: "ODbL 1.0 — attribution and share-alike obligations apply",
    classification: "open-data",
    limitations: "Crowdsourced mapping can be incomplete or stale. Unmapped objects are not assumed absent.",
    usedInScoring: true,
    refresh: "Manual versioned ingestion for this MVP",
  },
  {
    id: "boundary",
    dataset: "HSR Layout locality polygon — OSM relation 17168010",
    provider: "OpenStreetMap; relation source tag references Bengaluru Development Authority",
    sourceUrl: "https://www.openstreetmap.org/relation/17168010",
    purpose: "Scope boundary and clipping mask",
    dataType: "Locality boundary polygon",
    resolution: "Mapped polygon",
    lastImported: "Generated with npm run data:ingest",
    license: "ODbL 1.0",
    classification: "open-data",
    limitations: "A locality boundary is not the same as the municipal ward also named HSR Layout.",
    usedInScoring: false,
    refresh: "Manual versioned ingestion",
  },
  {
    id: "weather",
    dataset: "Weather forecast and recent model context",
    provider: "Open-Meteo",
    sourceUrl: SOURCE_URLS.openMeteo,
    purpose: "Observed-model and forecast rainfall context",
    dataType: "Modelled",
    resolution: "Provider-selected weather-model grid; not a 100 m observation",
    lastImported: "Fetched server-side on demand",
    license: "CC BY 4.0; Open-Meteo attribution required",
    classification: "modelled",
    limitations: "Forecast-grid values do not represent conditions at a particular street or property.",
    usedInScoring: true,
    refresh: "15-minute server cache",
  },
  {
    id: "air",
    dataset: "CAMS global atmospheric composition forecast via Open-Meteo",
    provider: "Open-Meteo / Copernicus Atmosphere Monitoring Service",
    sourceUrl: SOURCE_URLS.openMeteoAir,
    purpose: "Outdoor PM2.5 and regional AQI context",
    dataType: "Modelled",
    resolution: "Approximately 45 km in the global CAMS model used for Bengaluru",
    lastImported: "Fetched server-side on demand",
    license: "CC BY 4.0 data attribution",
    classification: "modelled",
    limitations: "Regional model output is not indoor, street-level, or building-level air monitoring.",
    usedInScoring: true,
    refresh: "45-minute server cache",
  },
  {
    id: "drains",
    dataset: "Bengaluru Stormwater Drains Maps 2022",
    provider: "BBMP, published by OpenCity",
    sourceUrl: SOURCE_URLS.openCityDrains,
    purpose: "Mapped stormwater-drain proximity and flood context",
    dataType: "Imported KML line geometry",
    resolution: "Primary, secondary and tertiary mapped drains",
    lastImported: "Generated with npm run data:ingest",
    license: "Dataset page terms; provider attribution retained",
    classification: "open-data",
    limitations: "Map publication does not guarantee present condition, capacity, maintenance, or completeness.",
    usedInScoring: true,
    refresh: "Versioned static import",
  },
  {
    id: "flood",
    dataset: "Flood-vulnerable, flood-prone, and BBMP low-lying locations",
    provider: "Government and BBMP-derived layers published by OpenCity",
    sourceUrl: SOURCE_URLS.openCityFlood,
    purpose: "Historical/documented susceptibility context",
    dataType: "Imported KML point geometry",
    resolution: "Mapped locations with varying source dates",
    lastImported: "Generated with npm run data:ingest",
    license: "OpenCity package marks the dataset Public Domain / other",
    classification: "open-data",
    limitations: "Known locations are not a complete inventory. Proximity does not predict that a cell will flood.",
    usedInScoring: true,
    refresh: "Versioned static import",
  },
  {
    id: "elevation",
    dataset: "Copernicus DEM GLO-90 elevation",
    provider: "Copernicus Programme via Open-Meteo Elevation API",
    sourceUrl: "https://open-meteo.com/en/docs/elevation-api",
    purpose: "Cell-centre elevation, relative elevation and local-slope flood features",
    dataType: "Digital elevation model",
    resolution: "90 m source grid sampled at each 100 m cell centre",
    lastImported: "Generated with npm run data:ingest",
    license: "Copernicus data attribution plus Open-Meteo attribution",
    classification: "modelled",
    limitations: "Cannot resolve basements, kerbs, building pads, local drain condition, or sub-cell depressions.",
    usedInScoring: true,
    refresh: "Static versioned import",
  },
  {
    id: "noise",
    dataset: "Environmental-noise proxy",
    provider: "HSR Intelligence Map",
    sourceUrl: "/methodology#noise",
    purpose: "Low-confidence road and activity exposure estimate",
    dataType: "Derived",
    resolution: "100 m analysis cell",
    lastImported: "Recalculated during ingestion",
    license: "Methodology published in this application",
    classification: "derived",
    limitations: "Not a sound-pressure measurement; traffic volume, barriers, floor height and time of day are absent.",
    usedInScoring: true,
    refresh: "Whenever OSM source geometry is re-ingested",
  },
];
