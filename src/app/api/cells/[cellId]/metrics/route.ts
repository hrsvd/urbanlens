import { NextResponse } from "next/server";
import { getBootstrap, getCell } from "@/server/data";
import { fetchAirQuality, fetchWeather } from "@/server/external";
import { buildCellMetrics } from "@/server/metrics";

export const revalidate = 900;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cellId: string }> },
) {
  const { cellId } = await params;
  const [cell, bootstrap] = await Promise.all([getCell(cellId), getBootstrap()]);
  if (!cell) return NextResponse.json({ error: "Unknown HSR analysis cell." }, { status: 404 });

  const { centerLatitude, centerLongitude } = cell.properties;
  const [airResult, weatherResult] = await Promise.allSettled([
    fetchAirQuality(centerLatitude, centerLongitude),
    fetchWeather(centerLatitude, centerLongitude),
  ]);
  const air = airResult.status === "fulfilled" ? airResult.value : null;
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const response = buildCellMetrics(cell, bootstrap.meta.generatedAt, air, weather);

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      "X-Data-Completeness": air && weather ? "complete" : "partial",
    },
  });
}
