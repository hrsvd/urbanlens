import { NextResponse } from "next/server";
import { getCell } from "@/server/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cellId: string }> },
) {
  const { cellId } = await params;
  const cell = await getCell(cellId);
  if (!cell) return NextResponse.json({ error: "Unknown HSR analysis cell." }, { status: 404 });
  return NextResponse.json({
    id: cell.properties.id,
    bounds: cell.geometry,
    center: {
      latitude: cell.properties.centerLatitude,
      longitude: cell.properties.centerLongitude,
    },
    sizeMeters: cell.properties.sizeMeters,
    staticFeatures: cell.properties.staticFeatures,
  });
}
