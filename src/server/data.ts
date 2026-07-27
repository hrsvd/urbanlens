import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { LocalityId } from "@/lib/constants";
import { DEFAULT_LOCALITY_ID, LOCALITIES, localityFromCellId } from "@/lib/constants";
import type { AnalysisCellFeature, MapBootstrap, StaticIntelligence } from "@/lib/types";

// Per-locality bootstrap memos: one Promise per locality, resolved once and reused.
const bootstrapCache = new Map<LocalityId, Promise<MapBootstrap>>();

// Per-locality static-intelligence memos.
const intelligenceCache = new Map<LocalityId, Promise<StaticIntelligence | null>>();

function bootstrapPath(localityId: LocalityId): string {
  return path.join(process.cwd(), "public", "data", `${localityId}-bootstrap.json`);
}

function intelligencePath(localityId: LocalityId): string {
  return path.join(process.cwd(), "public", "data", `${localityId}-static-intelligence.json`);
}

export function getBootstrap(localityId: LocalityId = DEFAULT_LOCALITY_ID): Promise<MapBootstrap> {
  let promise = bootstrapCache.get(localityId);
  if (!promise) {
    promise = fs
      .readFile(bootstrapPath(localityId), "utf8")
      .then((text) => JSON.parse(text) as MapBootstrap);
    bootstrapCache.set(localityId, promise);
  }
  return promise;
}

export function getStaticIntelligence(localityId: LocalityId = DEFAULT_LOCALITY_ID): Promise<StaticIntelligence | null> {
  let promise = intelligenceCache.get(localityId);
  if (!promise) {
    promise = fs
      .readFile(intelligencePath(localityId), "utf8")
      .then((text) => JSON.parse(text) as StaticIntelligence)
      .catch(() => null);
    intelligenceCache.set(localityId, promise);
  }
  return promise;
}

export async function getCell(cellId: string): Promise<AnalysisCellFeature | null> {
  const localityId = localityFromCellId(cellId) ?? DEFAULT_LOCALITY_ID;
  const bootstrap = await getBootstrap(localityId);
  return bootstrap.grid.features.find((cell) => cell.properties.id === cellId) ?? null;
}

export function localityForCell(cellId: string): LocalityId {
  return localityFromCellId(cellId) ?? DEFAULT_LOCALITY_ID;
}

// Returns all locality bootstraps that have a corresponding file on disk.
// Used by the search API to build a combined cross-locality index.
export async function getAllBootstraps(): Promise<Map<LocalityId, MapBootstrap>> {
  const results = new Map<LocalityId, MapBootstrap>();
  await Promise.all(
    (Object.keys(LOCALITIES) as LocalityId[]).map(async (id) => {
      try {
        const bootstrap = await getBootstrap(id);
        results.set(id, bootstrap);
      } catch {
        // Locality file not yet generated — silently skip.
      }
    }),
  );
  return results;
}
