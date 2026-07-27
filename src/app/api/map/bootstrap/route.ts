import { NextResponse } from "next/server";
import type { LocalityId } from "@/lib/constants";
import { DEFAULT_LOCALITY_ID, LOCALITIES } from "@/lib/constants";
import { getBootstrap } from "@/server/data";

export const revalidate = 3600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("locality") ?? DEFAULT_LOCALITY_ID;
  const localityId = (raw in LOCALITIES ? raw : DEFAULT_LOCALITY_ID) as LocalityId;

  try {
    return NextResponse.json(await getBootstrap(localityId), {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Locality": localityId,
      },
    });
  } catch {
    return NextResponse.json(
      { error: `Local map data for "${localityId}" is unavailable. Run npm run data:ingest -- --locality ${localityId}.` },
      { status: 503 },
    );
  }
}
