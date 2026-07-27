import "server-only";

import { z } from "zod";

const WEATHER_TTL = 15 * 60 * 1000;
const AIR_TTL = 45 * 60 * 1000;
const cache = new Map<string, { expires: number; value: unknown }>();

const weatherSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().optional(),
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number().nullable().optional(),
    precipitation: z.number().nullable().optional(),
    rain: z.number().nullable().optional(),
    showers: z.number().nullable().optional(),
    weather_code: z.number().nullable().optional(),
  }).optional(),
  hourly: z.object({
    time: z.array(z.string()),
    precipitation: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()).optional(),
  }).optional(),
  daily: z.object({
    time: z.array(z.string()),
    precipitation_sum: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }).optional(),
});

const airSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    pm10: z.number().nullable().optional(),
    pm2_5: z.number().nullable().optional(),
    carbon_monoxide: z.number().nullable().optional(),
    nitrogen_dioxide: z.number().nullable().optional(),
    sulphur_dioxide: z.number().nullable().optional(),
    ozone: z.number().nullable().optional(),
    us_aqi: z.number().nullable().optional(),
  }),
});

// CPCB (data.gov.in) real-time AQI response schema.
// Each record carries one pollutant reading for one station.
const cpcbRecordSchema = z.object({
  state: z.string().optional(),
  city: z.string().optional(),
  station: z.string().optional(),
  last_update: z.string().optional(),
  pollutant_id: z.string().optional(),
  pollutant_min: z.string().optional(),
  pollutant_max: z.string().optional(),
  pollutant_avg: z.string().optional(),
  pollutant_unit: z.string().optional(),
});

const cpcbResponseSchema = z.object({
  status: z.string().optional(),
  records: z.array(cpcbRecordSchema).optional(),
});

export type WeatherResult = z.infer<typeof weatherSchema> & {
  observed24hMm: number | null;
  forecast24hMm: number | null;
  fetchedAt: string;
};

export type AirQualityResult = z.infer<typeof airSchema> & {
  fetchedAt: string;
  // Which upstream source provided the PM2.5 reading.
  source: "cpcb" | "cams";
  // Human-readable station name when the source is CPCB.
  cpcbStation?: string;
  // Actual confidence level varies by source resolution.
  sourceConfidence: number;
};

async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  ttl: number,
  attempts = 2,
): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value as T;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "HSR-Intelligence-Map/0.1" },
        signal: controller.signal,
        next: { revalidate: Math.floor(ttl / 1000) },
      });
      if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
      const value = schema.parse(await response.json());
      cache.set(url, { expires: Date.now() + ttl, value });
      return value;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function bucketCoordinate(value: number) {
  // All HSR cells reuse a small number of regional model-grid requests.
  return Math.round(value / 0.025) * 0.025;
}

// Preferred CPCB station names for Bengaluru, ordered by proximity to HSR Layout.
// These are official CPCB/KSPCB monitoring station names as they appear in the
// data.gov.in feed. Closest-to-HSR first so the station selector picks the best.
const BENGALURU_PREFERRED_STATIONS = [
  "BTM Layout",
  "Bapuji Nagar",
  "Silk Board",
  "Hebbal",
  "Peenya",
];

function rankStation(stationName: string): number {
  const lower = stationName.toLowerCase();
  for (let i = 0; i < BENGALURU_PREFERRED_STATIONS.length; i += 1) {
    if (lower.includes(BENGALURU_PREFERRED_STATIONS[i].toLowerCase())) return i;
  }
  return BENGALURU_PREFERRED_STATIONS.length;
}

// Fetch PM2.5 from CPCB via data.gov.in.
// Returns null if the API key is missing, the call fails, or no valid reading exists.
async function fetchCpcbPm25(): Promise<{ pm25: number; station: string; updatedAt: string } | null> {
  const apiKey = process.env.CPCB_API_KEY;
  if (!apiKey) return null;

  const cacheKey = "cpcb:bengaluru:pm25";
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value as { pm25: number; station: string; updatedAt: string } | null;

  try {
    const params = new URLSearchParams({
      "api-key": apiKey,
      format: "json",
      limit: "50",
      "filters[State]": "Karnataka",
      "filters[City]": "Bengaluru",
      "filters[pollutant_id]": "PM2.5",
    });
    const url = `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69?${params}`;
    const raw = await fetchJson(url, cpcbResponseSchema, AIR_TTL, 1);
    const records = raw.records ?? [];

    const pm25Records = records
      .filter((r) => r.pollutant_id === "PM2.5" && r.pollutant_avg && !Number.isNaN(Number(r.pollutant_avg)))
      .sort((a, b) => rankStation(a.station ?? "") - rankStation(b.station ?? ""));

    if (!pm25Records.length) {
      cache.set(cacheKey, { expires: Date.now() + AIR_TTL, value: null });
      return null;
    }

    const best = pm25Records[0];
    const result = {
      pm25: Number(best.pollutant_avg),
      station: best.station ?? "Bengaluru CPCB station",
      updatedAt: best.last_update ?? new Date().toISOString(),
    };
    cache.set(cacheKey, { expires: Date.now() + AIR_TTL, value: result });
    return result;
  } catch {
    cache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, value: null });
    return null;
  }
}

export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherResult> {
  const lat = bucketCoordinate(latitude);
  const lon = bucketCoordinate(longitude);
  const base = process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com";
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,precipitation,rain,showers,weather_code",
    hourly: "precipitation,precipitation_probability",
    daily: "precipitation_sum,precipitation_probability_max",
    past_hours: "24",
    forecast_hours: "24",
    forecast_days: "2",
    timezone: "Asia/Kolkata",
  });
  const raw = await fetchJson(`${base}/v1/forecast?${params}`, weatherSchema, WEATHER_TTL);
  const hourly = raw.hourly?.precipitation ?? [];
  const observed = hourly.slice(0, Math.min(24, hourly.length)).filter((value): value is number => value !== null);
  const forecast = hourly.slice(24, 48).filter((value): value is number => value !== null);
  return {
    ...raw,
    observed24hMm: observed.length ? observed.reduce((sum, value) => sum + value, 0) : null,
    forecast24hMm: forecast.length
      ? forecast.reduce((sum, value) => sum + value, 0)
      : raw.daily?.precipitation_sum[0] ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchAirQuality(latitude: number, longitude: number): Promise<AirQualityResult> {
  const lat = bucketCoordinate(latitude);
  const lon = bucketCoordinate(longitude);

  // Try CPCB first: real monitoring station reading, higher spatial confidence
  // than the 45 km CAMS global model grid.
  const cpcb = await fetchCpcbPm25();
  if (cpcb !== null) {
    const pm25 = cpcb.pm25;
    return {
      latitude: lat,
      longitude: lon,
      timezone: "Asia/Kolkata",
      current: {
        time: cpcb.updatedAt,
        pm2_5: pm25,
        pm10: null,
        carbon_monoxide: null,
        nitrogen_dioxide: null,
        sulphur_dioxide: null,
        ozone: null,
        us_aqi: null,
      },
      fetchedAt: new Date().toISOString(),
      source: "cpcb",
      cpcbStation: cpcb.station,
      // CPCB station is ~3-5 km from HSR; substantially better than 45 km CAMS grid.
      sourceConfidence: 0.72,
    };
  }

  // Fallback: Open-Meteo CAMS global atmospheric model (~45 km grid).
  const base = process.env.OPEN_METEO_AIR_QUALITY_BASE_URL || "https://air-quality-api.open-meteo.com";
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
    timezone: "Asia/Kolkata",
  });
  const raw = await fetchJson(`${base}/v1/air-quality?${params}`, airSchema, AIR_TTL);
  return {
    ...raw,
    fetchedAt: new Date().toISOString(),
    source: "cams",
    sourceConfidence: 0.55,
  };
}

// ── OSRM routing ─────────────────────────────────────────────────────────────
// Uses the public OSRM demo server (router.project-osrm.org) for car routing.
// This is OpenStreetMap-based routing: actual road network geometry, not
// straight-line estimates. Does NOT include real-time traffic.
// Route: /route/v1/driving/{origin_lon},{origin_lat};{dest_lon},{dest_lat}

const OSRM_BASE = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const OSRM_TTL = 24 * 60 * 60 * 1000; // 24 h — road network doesn't change daily

const osrmRouteSchema = z.object({
  code: z.string(),
  routes: z.array(z.object({
    distance: z.number(),   // metres
    duration: z.number(),   // seconds
    legs: z.array(z.unknown()),
  })).optional(),
  waypoints: z.array(z.unknown()).optional(),
});

export type OsrmRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  durationMinutes: number;
  fetchedAt: string;
  source: "osrm";
  note: string;
};

export async function fetchOsrmRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
): Promise<OsrmRouteResult | null> {
  const key = `osrm:${originLat.toFixed(4)},${originLon.toFixed(4)};${destLat.toFixed(4)},${destLon.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as OsrmRouteResult | null;

  const url = `${OSRM_BASE}/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=false&steps=false`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "HSR-Intelligence-Map/0.1 (non-commercial research)" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OSRM ${response.status}`);
      const raw = osrmRouteSchema.parse(await response.json());
      if (raw.code !== "Ok" || !raw.routes?.length) {
        cache.set(key, { expires: Date.now() + OSRM_TTL, value: null });
        return null;
      }
      const route = raw.routes[0];
      const result: OsrmRouteResult = {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        durationMinutes: Math.round(route.duration / 60),
        fetchedAt: new Date().toISOString(),
        source: "osrm",
        note: "OSM road network routing — no real-time traffic. Off-peak indicative only.",
      };
      cache.set(key, { expires: Date.now() + OSRM_TTL, value: result });
      return result;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    cache.set(key, { expires: Date.now() + 5 * 60 * 1000, value: null });
    return null;
  }
}

export function clearExternalCache() {
  cache.clear();
}
