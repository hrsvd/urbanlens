"use client";

import {
  Activity,
  Antenna,
  Building,
  ChevronDown,
  CloudRain,
  Construction,
  Droplets,
  ExternalLink,
  Gauge,
  Info,
  MapPin,
  Network,
  Route,
  ShieldCheck,
  Volume2,
  Waves,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMapStore } from "@/lib/store";
import type { AnalysisCell, CellMetric, MetricEvidence } from "@/lib/types";

const metricIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  airQuality: Activity,
  floodSusceptibility: Waves,
  drainProximity: Droplets,
  rainfall: CloudRain,
  estimatedNoise: Volume2,
  connectivity: Route,
  networkQuality: Antenna,
  constructionProximity: Construction,
  nearbyAmenities: Building,
};

function formatDate(value?: string) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function riskCopy(cell: AnalysisCell) {
  if (cell.riskLevel === "low") return "Lower observed risk";
  if (cell.riskLevel === "moderate") return "Moderate / mixed signals";
  if (cell.riskLevel === "high") return "Higher observed risk";
  return "Insufficient evidence";
}

function EvidenceRow({ evidence }: { evidence: MetricEvidence }) {
  return (
    <div className="evidence-row">
      <div>
        <span>{evidence.sourceType}</span>
        <strong>{evidence.sourceName}</strong>
      </div>
      <dl>
        <div><dt>Resolution</dt><dd>{evidence.geographicResolution}</dd></div>
        <div><dt>Updated</dt><dd>{formatDate(evidence.updatedAt || evidence.collectedAt)}</dd></div>
      </dl>
      {evidence.sourceUrl && (
        <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">
          View source <ExternalLink aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function MetricCard({ metric, open = false }: { metric: CellMetric; open?: boolean }) {
  const Icon = metricIcons[metric.key] || Gauge;
  const score = metric.ratingOutOf10;
  return (
    <details className={`metric-card ${metric.status}`} open={open}>
      <summary>
        <span className="metric-icon"><Icon aria-hidden="true" /></span>
        <div className="metric-title">
          <strong>{metric.label}</strong>
          <span>{metric.value === null || metric.value === undefined ? "Data unavailable" : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`}</span>
        </div>
        <div className="metric-score">
          {score === null ? <strong>—</strong> : <strong>{score.toFixed(1)}</strong>}
          <small>{score === null ? "unscored" : "/ 10"}</small>
        </div>
        <ChevronDown className="metric-chevron" aria-hidden="true" />
      </summary>
      <div className="metric-detail">
        <p>{metric.explanation}</p>
        <div className="confidence-row">
          <span>Evidence confidence</span>
          <div><i style={{ width: `${Math.round(metric.confidence * 100)}%` }} /></div>
          <strong>{Math.round(metric.confidence * 100)}%</strong>
        </div>
        {metric.evidence.length ? (
          <div className="evidence-list">
            {metric.evidence.map((evidence, index) => (
              <EvidenceRow key={`${evidence.sourceName}-${index}`} evidence={evidence} />
            ))}
          </div>
        ) : (
          <div className="unavailable-note">
            <Info aria-hidden="true" />
            <span>This metric is not included in the overall score.</span>
          </div>
        )}
      </div>
    </details>
  );
}

function PanelSkeleton() {
  return (
    <div className="panel-skeleton" aria-label="Loading cell evidence">
      <div className="skeleton-hero"><i /><i /><i /></div>
      {[0, 1, 2, 3, 4].map((item) => <div className="skeleton-card" key={item}><i /><span><b /><b /></span><em /></div>)}
    </div>
  );
}

export function IntelligencePanel({
  cell,
  loading,
  error,
}: {
  cell: AnalysisCell | null;
  loading: boolean;
  error: boolean;
}) {
  const open = useMapStore((state) => state.panelOpen);
  const close = useMapStore((state) => state.setPanelOpen);
  const context = useMapStore((state) => state.selectedContext);
  const selectedCellId = useMapStore((state) => state.selectedCellId);
  const metrics = cell
    ? [
      cell.metrics.airQuality,
      cell.metrics.floodSusceptibility,
      cell.metrics.drainProximity,
      cell.metrics.rainfall,
      cell.metrics.estimatedNoise,
      cell.metrics.connectivity,
      cell.metrics.nearbyAmenities,
      cell.metrics.constructionProximity,
      cell.metrics.networkQuality,
    ].filter((metric): metric is CellMetric => Boolean(metric))
    : [];

  return (
    <AnimatePresence>
      {open && selectedCellId && (
        <motion.aside
          className="intelligence-panel"
          aria-label="Selected cell intelligence"
          initial={{ x: "100%", opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
        >
          <div className="sheet-handle" aria-hidden="true" />
          <header className="panel-topbar">
            <div>
              <span>GEOGRAPHIC CELL</span>
              <strong>{selectedCellId}</strong>
            </div>
            <button type="button" onClick={() => close(false)} aria-label="Close cell intelligence">
              <X aria-hidden="true" />
            </button>
          </header>

          {loading && <PanelSkeleton />}
          {error && !loading && (
            <div className="panel-error">
              <Network aria-hidden="true" />
              <h2>Evidence service unavailable</h2>
              <p>The cell remains selected, but dynamic metrics could not be prepared. No substitute values were generated.</p>
            </div>
          )}
          {cell && !loading && (
            <div className="panel-scroll">
              <section className={`score-hero ${cell.riskLevel}`}>
                <div className="score-ring">
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <circle cx="50" cy="50" r="43" />
                    <circle
                      cx="50"
                      cy="50"
                      r="43"
                      pathLength="100"
                      style={{ strokeDasharray: `${(cell.overallScore ?? 0) * 10} 100` }}
                    />
                  </svg>
                  <div>
                    <strong>{cell.overallScore?.toFixed(1) ?? "—"}</strong>
                    <span>/ 10</span>
                  </div>
                </div>
                <div className="score-copy">
                  <span>OVERALL CELL SIGNAL</span>
                  <h2>{riskCopy(cell)}</h2>
                  <p>{Math.round(cell.confidence * 100)}% evidence confidence · {cell.sizeMeters} m × {cell.sizeMeters} m</p>
                </div>
              </section>

              {context && (
                <div className="place-context">
                  <MapPin aria-hidden="true" />
                  <p>Showing cell-level metrics for the area containing <strong>{context.name}</strong>. They do not describe that place itself.</p>
                </div>
              )}

              <div className="panel-section-title">
                <span>Evidence signals</span>
                <em>{metrics.filter((metric) => metric.ratingOutOf10 !== null).length} scored</em>
              </div>
              <div className="metric-list">
                {metrics.map((metric, index) => <MetricCard key={metric.key} metric={metric} open={index < 2} />)}
              </div>

              <section className="score-method">
                <ShieldCheck aria-hidden="true" />
                <div><strong>Transparent scoring</strong><p>Missing metrics are ignored and weights are re-normalised. Confidence falls when important evidence is unavailable.</p></div>
                <a href="/methodology">Methodology</a>
              </section>

              <footer className="panel-disclaimer">
                <p>Metrics describe the selected geographic cell and are based on public, modelled, or derived data. They do not certify the safety, quality, or condition of any individual property.</p>
                <span>Updated {formatDate(cell.updatedAt)}</span>
              </footer>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
