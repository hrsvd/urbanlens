import { NextResponse } from "next/server";
import { getCell, getStaticIntelligence, localityForCell, getCellSummaries } from "@/server/data";
import { getBootstrap } from "@/server/data";
import { fetchAirQuality, fetchWeather } from "@/server/external";
import { buildCellMetrics } from "@/server/metrics";

export const revalidate = 900;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cellId: string }> },
) {
  const { cellId } = await params;
  const localityId = localityForCell(cellId);

  const [cell, bootstrap, intelligence, summaries] = await Promise.all([
    getCell(cellId),
    getBootstrap(localityId),
    getStaticIntelligence(localityId),
    getCellSummaries(localityId),
  ]);
  if (!cell) return NextResponse.json({ error: "Unknown analysis cell." }, { status: 404 });

  const { centerLatitude, centerLongitude } = cell.properties;
  const [airResult, weatherResult] = await Promise.allSettled([
    fetchAirQuality(centerLatitude, centerLongitude),
    fetchWeather(centerLatitude, centerLongitude),
  ]);
  const air = airResult.status === "fulfilled" ? airResult.value : null;
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const response = await buildCellMetrics(
    cell,
    bootstrap.meta.generatedAt,
    air,
    weather,
    intelligence,
    centerLatitude,
    centerLongitude,
  );

  // Attach pre-generated AI summary if available; null otherwise.
  const aiSummary = summaries[cellId] ?? null;

  return NextResponse.json({ ...response, aiSummary }, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      "X-Data-Completeness": air && weather ? "complete" : "partial",
      "X-Locality": localityId,
    },
  });
}
