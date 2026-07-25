import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "HSR Intelligence Map",
    scope: "HSR Layout, Bengaluru",
    time: new Date().toISOString(),
  });
}
