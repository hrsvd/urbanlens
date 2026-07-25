import { NextResponse } from "next/server";
import { getBootstrap } from "@/server/data";

export const revalidate = 86400;

function rank(name: string, query: string) {
  const normalized = name.toLocaleLowerCase("en-IN");
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  const wordIndex = normalized.split(/\s+/).findIndex((word) => word.startsWith(query));
  if (wordIndex >= 0) return 2 + wordIndex;
  return 10 + normalized.indexOf(query);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase("en-IN") ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const data = await getBootstrap();
  const results = data.searchIndex
    .filter((item) => item.name.toLocaleLowerCase("en-IN").includes(query))
    .sort((a, b) => rank(a.name, query) - rank(b.name, query) || a.name.localeCompare(b.name))
    .slice(0, 8);

  return NextResponse.json({
    results,
    scope: "HSR Layout boundary",
    provider: "Locally ingested OpenStreetMap index",
  });
}
