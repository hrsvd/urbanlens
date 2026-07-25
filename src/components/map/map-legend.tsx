import { METRIC_LABELS } from "@/lib/constants";
import { useMapStore } from "@/lib/store";

export function MapLegend() {
  const heatmap = useMapStore((state) => state.layers.heatmap);
  const activeMetric = useMapStore((state) => state.activeMetric);
  if (!heatmap) return null;
  const isRegional = activeMetric === "airQuality" || activeMetric === "rainfall";

  return (
    <aside className="map-legend" aria-label="Map score legend">
      <header><span>Surface signal</span><strong>{METRIC_LABELS[activeMetric]}</strong></header>
      <div className="legend-scale"><i /><i /><i /><i /><i /></div>
      <div className="legend-labels"><span>Higher observed risk</span><span>Lower</span></div>
      {isRegional && <p>Uniform across HSR at the provider&apos;s regional model resolution.</p>}
      <footer><b /> Unknown or unavailable</footer>
    </aside>
  );
}
