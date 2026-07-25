"use client";

import {
  Building2,
  Droplets,
  Grid3X3,
  HelpCircle,
  Layers3,
  MapPinned,
  RotateCcw,
  Route,
  Tags,
  ThermometerSun,
} from "lucide-react";
import { METRIC_LABELS } from "@/lib/constants";
import { useMapStore } from "@/lib/store";
import type { LayerVisibility, MetricKey } from "@/lib/types";

const toggles: Array<[keyof LayerVisibility, string, React.ComponentType<React.SVGProps<SVGSVGElement>>]> = [
  ["buildings", "3D buildings", Building2],
  ["roads", "Roads", Route],
  ["labels", "Labels", Tags],
  ["drains", "Drains", Droplets],
  ["floodPoints", "Flood evidence", MapPinned],
  ["grid", "100 m grid", Grid3X3],
  ["heatmap", "Heatmap", ThermometerSun],
];

const metrics: MetricKey[] = [
  "overall",
  "airQuality",
  "floodSusceptibility",
  "drainProximity",
  "rainfall",
  "estimatedNoise",
  "connectivity",
];

export function MapControls({ onReset, onHelp }: { onReset: () => void; onHelp: () => void }) {
  const layers = useMapStore((state) => state.layers);
  const toggleLayer = useMapStore((state) => state.toggleLayer);
  const activeMetric = useMapStore((state) => state.activeMetric);
  const setActiveMetric = useMapStore((state) => state.setActiveMetric);

  return (
    <>
      <div className="map-controls" aria-label="Map controls">
        <button type="button" onClick={onReset} data-tooltip="Reset camera" aria-label="Reset camera">
          <RotateCcw aria-hidden="true" />
        </button>
        <span />
        {toggles.map(([key, label, Icon]) => (
          <button
            type="button"
            key={key}
            className={layers[key] ? "active" : ""}
            onClick={() => toggleLayer(key)}
            aria-pressed={layers[key]}
            aria-label={`Toggle ${label.toLowerCase()}`}
            data-tooltip={label}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
        <span />
        <button type="button" onClick={onHelp} data-tooltip="How to explore" aria-label="Map instructions">
          <HelpCircle aria-hidden="true" />
        </button>
      </div>
      <div className={`metric-switcher ${layers.heatmap ? "visible" : ""}`}>
        <Layers3 aria-hidden="true" />
        <label htmlFor="metric-mode">Surface</label>
        <select
          id="metric-mode"
          value={activeMetric}
          onChange={(event) => setActiveMetric(event.target.value as MetricKey)}
          disabled={!layers.heatmap}
        >
          {metrics.map((metric) => <option key={metric} value={metric}>{METRIC_LABELS[metric]}</option>)}
        </select>
      </div>
    </>
  );
}
