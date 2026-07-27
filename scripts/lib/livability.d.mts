// Type declarations for the shared livability derivation module so it can be
// imported from typed tests. The implementation lives in livability.mjs.

export type LivabilityCategory =
  | "education"
  | "healthcare"
  | "transit"
  | "metro"
  | "dailyNeeds"
  | "police";

export type Categories = Record<LivabilityCategory, number[][]>;

export interface AccessOptions {
  near: number;
  far: number;
  perCount?: number;
  bonusCap?: number;
  floor?: number;
}

export function lonLatToMercator(coordinate: number[]): [number, number];
export function nearestPointDistance(center: number[], points: number[][]): number | null;
export function countWithinRadius(center: number[], points: number[][], radiusMeters: number): number;
export function nearestLineDistance(center: number[], lines: number[][][]): number | null;
export function accessScore(
  distance: number | null,
  count: number,
  options: AccessOptions,
): number | null;
export function policeProximityScore(distance: number | null): number | null;
export function classifyOsmTags(tags?: Record<string, string>): LivabilityCategory | null;
export function classifyKind(kind?: string): LivabilityCategory | null;
export function emptyCategories(): Categories;
export function deriveLivability(
  center: number[],
  categories: Categories,
  greenLines?: number[][][],
): {
  features: Record<string, number | null>;
  scores: {
    education: number | null;
    healthcare: number | null;
    transit: number | null;
    dailyNeeds: number | null;
    greenSpace: number | null;
    safetyProxy: number | null;
  };
};
export const STATIC_WEIGHTS: Record<string, number>;
export function staticOverall(staticScores: Record<string, number | null | undefined>): number | null;
export function greenLinesFromFeatures(features?: Array<{ geometry?: { type: string; coordinates: number[][][] } }>): number[][][];
