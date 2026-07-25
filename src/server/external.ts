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

export type WeatherResult = z.infer<typeof weatherSchema> & {
  observed24hMm: number | null;
  forecast24hMm: number | null;
  fetchedAt: string;
};

export type AirQualityResult = z.infer<typeof airSchema> & {
  fetchedAt: string;
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
  const base = process.env.OPEN_METEO_AIR_QUALITY_BASE_URL || "https://air-quality-api.open-meteo.com";
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
    timezone: "Asia/Kolkata",
  });
  const raw = await fetchJson(`${base}/v1/air-quality?${params}`, airSchema, AIR_TTL);
  return { ...raw, fetchedAt: new Date().toISOString() };
}

export function clearExternalCache() {
  cache.clear();
}
