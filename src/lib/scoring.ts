import { DEFAULT_WEIGHTS } from "./constants";
import type { CellMetric, CellMetrics, MetricStatus, RiskLevel } from "./types";

type ScoreableKey = keyof typeof DEFAULT_WEIGHTS;

export type ScoreResult = {
  score: number | null;
  confidence: number;
  riskLevel: RiskLevel;
  coverage: number;
};

const clamp = (value: number, min = 0, max = 10) => Math.min(max, Math.max(min, value));

export function riskFromScore(score: number | null, confidence = 1): RiskLevel {
  if (score === null || confidence < 0.25) return "unknown";
  if (score >= 7.5) return "low";
  if (score >= 5) return "moderate";
  return "high";
}

export function statusFromScore(score: number | null): MetricStatus {
  if (score === null) return "unknown";
  if (score >= 7.5) return "good";
  if (score >= 5) return "moderate";
  return "poor";
}

export function recencyFactor(updatedAt?: string, maxAgeHours = 24): number {
  if (!updatedAt) return 0.85;
  const ageHours = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 3_600_000);
  if (ageHours <= maxAgeHours) return 1;
  return Math.max(0.65, 1 - ((ageHours - maxAgeHours) / (maxAgeHours * 8)) * 0.35);
}

export function calculateOverallScore(
  metrics: Partial<CellMetrics>,
  weights: Record<ScoreableKey, number> = DEFAULT_WEIGHTS,
): ScoreResult {
  const entries = (Object.keys(weights) as ScoreableKey[])
    .map((key) => ({ key, metric: metrics[key], weight: weights[key] }))
    .filter((entry): entry is { key: ScoreableKey; metric: CellMetric; weight: number } =>
      entry.metric?.ratingOutOf10 !== null && entry.metric?.ratingOutOf10 !== undefined,
    );

  if (!entries.length) return { score: null, confidence: 0, riskLevel: "unknown", coverage: 0 };

  const totalAvailableWeight = entries.reduce((sum, item) => sum + item.weight, 0);
  const totalConfiguredWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const coverage = totalAvailableWeight / totalConfiguredWeight;

  const weightedScore = entries.reduce(
    (sum, item) => sum + (item.metric.ratingOutOf10 ?? 0) * (item.weight / totalAvailableWeight),
    0,
  );
  const weightedConfidence = entries.reduce(
    (sum, item) => sum + item.metric.confidence * (item.weight / totalAvailableWeight),
    0,
  );
  const weakestSourceGuard = 0.88 + Math.min(...entries.map((item) => item.metric.confidence)) * 0.12;
  const confidence = clamp(weightedConfidence * (0.65 + coverage * 0.35), 0, 1);

  // Uncertainty is disclosed in confidence, while the visible score receives only a
  // modest evidence-quality adjustment so one weak input cannot dominate the result.
  const score = clamp(weightedScore * (0.94 + confidence * 0.06) * weakestSourceGuard);

  return {
    score: Number(score.toFixed(1)),
    confidence: Number(confidence.toFixed(2)),
    riskLevel: riskFromScore(score, confidence),
    coverage: Number(coverage.toFixed(2)),
  };
}

export type FloodFeatures = {
  distanceToKnownFloodPointMeters: number | null;
  distanceToDrainMeters: number | null;
  distanceToLakeMeters: number | null;
  relativeElevationMeters: number | null;
  localSlopeDegrees: number | null;
  rainfallLast24HoursMm: number | null;
  forecastRainfall24HoursMm: number | null;
  imperviousSurfaceEstimate?: number | null;
};

export function scoreFloodSusceptibility(features: FloodFeatures) {
  const riskParts: Array<{ risk: number; weight: number; reason: string }> = [];

  if (features.distanceToKnownFloodPointMeters !== null) {
    const risk = clamp(10 - features.distanceToKnownFloodPointMeters / 120);
    riskParts.push({
      risk,
      weight: 0.35,
      reason:
        features.distanceToKnownFloodPointMeters < 500
          ? `${Math.round(features.distanceToKnownFloodPointMeters)} m from a documented flood-vulnerable location`
          : "more than 500 m from the nearest imported flood-vulnerability point",
    });
  }
  if (features.distanceToDrainMeters !== null) {
    // Drain proximity is contextual: it raises exposure modestly but is not itself evidence of danger.
    riskParts.push({
      risk: clamp(7 - features.distanceToDrainMeters / 80),
      weight: 0.12,
      reason: `${Math.round(features.distanceToDrainMeters)} m from the mapped stormwater-drain network`,
    });
  }
  if (features.distanceToLakeMeters !== null) {
    riskParts.push({
      risk: clamp(8 - features.distanceToLakeMeters / 100),
      weight: 0.08,
      reason: `${Math.round(features.distanceToLakeMeters)} m from mapped surface water`,
    });
  }
  if (features.relativeElevationMeters !== null) {
    riskParts.push({
      risk: clamp(5 - features.relativeElevationMeters * 0.8),
      weight: 0.2,
      reason:
        features.relativeElevationMeters < -1
          ? "lower relative elevation than surrounding terrain"
          : "no strong low-elevation signal at the available resolution",
    });
  }
  if (features.localSlopeDegrees !== null) {
    riskParts.push({
      risk: clamp(7 - features.localSlopeDegrees * 0.9),
      weight: 0.05,
      reason: `${features.localSlopeDegrees.toFixed(1)}° modelled local slope`,
    });
  }
  if (features.rainfallLast24HoursMm !== null || features.forecastRainfall24HoursMm !== null) {
    const rain = (features.rainfallLast24HoursMm ?? 0) + (features.forecastRainfall24HoursMm ?? 0);
    riskParts.push({
      risk: clamp(rain / 6),
      weight: 0.2,
      reason: `${rain.toFixed(1)} mm observed plus forecast rainfall context`,
    });
  }

  if (!riskParts.length) {
    return { score: null, risk: null, confidence: 0, explanation: "Insufficient evidence for a flood-susceptibility estimate." };
  }

  const availableWeight = riskParts.reduce((sum, part) => sum + part.weight, 0);
  const risk = riskParts.reduce((sum, part) => sum + part.risk * part.weight, 0) / availableWeight;
  const confidence = Math.min(0.86, 0.2 + availableWeight * 0.66);
  const score = clamp(10 - risk);
  const strongest = [...riskParts].sort((a, b) => b.risk * b.weight - a.risk * a.weight).slice(0, 3);

  return {
    score: Number(score.toFixed(1)),
    risk: Number(risk.toFixed(1)),
    confidence: Number(confidence.toFixed(2)),
    explanation: `This cell's susceptibility estimate reflects ${strongest.map((part) => part.reason).join(", ")}. It is an indicator, not a flood prediction.`,
  };
}

export function airQualityScore(pm25: number | null, usAqi?: number | null): number | null {
  if (pm25 === null) return null;
  const pmScore =
    pm25 <= 5 ? 10 :
    pm25 <= 15 ? 10 - ((pm25 - 5) / 10) * 2 :
    pm25 <= 35 ? 8 - ((pm25 - 15) / 20) * 3 :
    pm25 <= 55 ? 5 - ((pm25 - 35) / 20) * 2 :
    Math.max(0, 3 - (pm25 - 55) / 25);
  const aqiScore = usAqi === null || usAqi === undefined ? pmScore : clamp(10 - usAqi / 20);
  return Number((pmScore * 0.7 + aqiScore * 0.3).toFixed(1));
}

export function rainfallScore(observedMm: number | null, forecastMm: number | null): number | null {
  if (observedMm === null && forecastMm === null) return null;
  const total = (observedMm ?? 0) + (forecastMm ?? 0);
  return Number(clamp(10 - total / 10).toFixed(1));
}
