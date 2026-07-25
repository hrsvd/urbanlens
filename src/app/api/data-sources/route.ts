import { NextResponse } from "next/server";
import { DATA_SOURCES } from "@/lib/data-sources";

export async function GET() {
  return NextResponse.json({ sources: DATA_SOURCES });
}
