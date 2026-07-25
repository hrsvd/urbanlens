import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AnalysisCellFeature, MapBootstrap } from "@/lib/types";

let bootstrapPromise: Promise<MapBootstrap> | null = null;

export function getBootstrap(): Promise<MapBootstrap> {
  if (!bootstrapPromise) {
    const filePath = path.join(process.cwd(), "public", "data", "hsr-bootstrap.json");
    bootstrapPromise = fs.readFile(filePath, "utf8").then((value) => JSON.parse(value) as MapBootstrap);
  }
  return bootstrapPromise;
}

export async function getCell(cellId: string): Promise<AnalysisCellFeature | null> {
  const bootstrap = await getBootstrap();
  return bootstrap.grid.features.find((cell) => cell.properties.id === cellId) ?? null;
}
