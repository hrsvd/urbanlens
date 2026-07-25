import { NextResponse } from "next/server";
import { getBootstrap } from "@/server/data";

export const revalidate = 3600;

export async function GET() {
  try {
    return NextResponse.json(await getBootstrap(), {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Local map data is unavailable. Run npm run data:ingest." },
      { status: 503 },
    );
  }
}
