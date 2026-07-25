import { NextResponse } from "next/server";
import { getBootstrap } from "@/server/data";

export const revalidate = 3600;

export async function GET() {
  const data = await getBootstrap();
  return NextResponse.json(data.buildings);
}
