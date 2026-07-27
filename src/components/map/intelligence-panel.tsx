"use client";

import {
  Activity,
  AlertTriangle,
  Antenna,
  Building,
  ChevronDown,
  CloudRain,
  Construction,
  Droplets,
  ExternalLink,
  GraduationCap,
  Gauge,
  Heart,
  Info,
  Leaf,
  MapPin,
  Network,
  Route,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Train,
  Volume2,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_WEIGHTS } from "@/lib/constants";
import { scoreToColor } from "@/lib/color";
import { useMapStore } from "@/lib/store";
import type { AnalysisCell, CellMetric, MetricCategory, MetricEvidence } from "@/lib/types";

// ── Icon map ──────────────────────────────────────────────────────────────────
const metricIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  airQuality: Activity,
  floodSusceptibility: Waves,
  drainProximity: Droplets,
  roadProximity: Volume2,
  rainfall: CloudRain,
  connectivity: Route,
  networkQuality: Antenna,
  constructionProximity: Construction,
  nearbyAmenities: Building,
  policeProximity: Siren,
  electricityContext: Zap,
  waterSupplyContext: Droplets,
  transitFrequency: Train,
  commuteContext: Route,
  heatIslandContext: Activity,
  ndviGreenCover: Leaf,
  civicComplaints: Shield,
  crimeContext: Shield,
  education: GraduationCap,
  healthcare: Heart,
  transit: Train,
  dailyNeeds: ShoppingBag,
  greenSpace: Leaf,
};

const categoryIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  environment: Leaf,
  connectivity: Train,
  education: GraduationCap,
  healthcare: Heart,
  dailyLife: ShoppingBag,
  utilities: Zap,
  civic: Shield,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Evidence row ──────────────────────────────────────────────────────────────
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

// ── Individual metric card ────────────────────────────────────────────────────
function MetricCard({
  metric,
  open = false,
  weightPct,
}: {
  metric: CellMetric;
  open?: boolean;
  /** This metric's share of its category's scored weight (0–100). */
  weightPct?: number;
}) {
  const Icon = metricIcons[metric.key] || Gauge;
  const score = metric.ratingOutOf10;
  const isContextOnly = score === null && metric.value !== null && metric.value !== undefined;

  return (
    <details className={`metric-card ${metric.status}`} open={open}>
      <summary>
        <span className="metric-icon"><Icon aria-hidden="true" /></span>
        <div className="metric-title">
          <strong>{metric.label}</strong>
          <span>
            {metric.value === null || metric.value === undefined
              ? "Data unavailable"
              : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`}
          </span>
        </div>
        <div className="metric-score">
          {score === null
            ? <strong className={isContextOnly ? "context-label" : ""}>—</strong>
            : <strong>{score.toFixed(1)}</strong>}
          <small>{score === null ? (isContextOnly ? "context" : "unavailable") : "/ 10"}</small>
        </div>
        <ChevronDown className="metric-chevron" aria-hidden="true" />
      </summary>
      <div className="metric-detail">
        <p>{metric.explanation}</p>
        {weightPct !== undefined && weightPct > 0 && score !== null && (
          <div className="metric-contribution">
            <div><span>Sub-score</span><strong>{score.toFixed(1)} / 10</strong></div>
            <div><span>Category weight</span><strong>{weightPct}%</strong></div>
          </div>
        )}
        {score === null && isContextOnly && (
          <div className="context-note">
            <Info aria-hidden="true" />
            <span>Shown as factual context only. Not included in the composite score.</span>
          </div>
        )}
        {metric.confidence > 0 && (
          <div className="confidence-row">
            <span>Evidence confidence</span>
            <div><i style={{ width: `${Math.round(metric.confidence * 100)}%` }} /></div>
            <strong>{Math.round(metric.confidence * 100)}%</strong>
          </div>
        )}
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

// ── Category card ─────────────────────────────────────────────────────────────
function CategoryCard({
  category,
  defaultOpen,
}: {
  category: MetricCategory;
  defaultOpen?: boolean;
}) {
  const weights = DEFAULT_WEIGHTS as Record<string, number>;
  const totalConfiguredWeight = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
  const Icon = categoryIcons[category.key] || Gauge;
  const score = category.score;
  const scoredCount = category.metrics.filter((m) => m.ratingOutOf10 !== null).length;
  const contextCount = category.metrics.filter(
    (m) => m.ratingOutOf10 === null && m.value !== null && m.value !== undefined,
  ).length;

  // Sum of DEFAULT_WEIGHTS for scored metrics in this category → composite share
  const categoryCompositeWeight = category.metrics.reduce(
    (sum, m) => sum + (weights[m.key] ?? 0), 0,
  );
  const compositePct = Math.round((categoryCompositeWeight / totalConfiguredWeight) * 100);

  const riskClass =
    score === null ? "unknown" :
    score >= 7.5 ? "low" :
    score >= 5 ? "moderate" : "high";

  return (
    <details className={`category-card ${riskClass}`} open={defaultOpen}>
      <summary>
        <span className="category-icon"><Icon aria-hidden="true" /></span>
        <div className="category-title">
          <strong>{category.label}</strong>
          <span>
            {compositePct > 0 ? `${compositePct}% of composite` : "context only"}
            {scoredCount > 0 ? ` · ${scoredCount} scored` : ""}
            {contextCount > 0 ? ` · ${contextCount} context` : ""}
          </span>
        </div>
        <div className="category-score">
          {score === null
            ? <strong>—</strong>
            : <strong style={{ color: scoreToColor(score) }}>{score.toFixed(1)}</strong>}
          <small>{score === null ? "context" : "/ 10"}</small>
        </div>
        <ChevronDown className="category-chevron" aria-hidden="true" />
      </summary>
      <div className="category-metrics">
        <p className="category-desc">{category.description}</p>
        {category.metrics.map((metric, index) => {
          // Metric's share of this category's total scored weight (for context inside category)
          const mw = weights[metric.key] ?? 0;
          const categoryWeightPct = categoryCompositeWeight > 0
            ? Math.round((mw / categoryCompositeWeight) * 100)
            : undefined;
          return (
            <MetricCard
              key={metric.key}
              metric={metric}
              open={index === 0 && scoredCount > 0}
              weightPct={categoryWeightPct}
            />
          );
        })}
      </div>
    </details>
  );
}

// ── Flood alert ───────────────────────────────────────────────────────────────
function FloodAlert({ score }: { score: number }) {
  return (
    <motion.div
      className="flood-alert"
      role="alert"
      aria-live="polite"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>High flood susceptibility</strong>
        <p>
          This cell scored {score.toFixed(1)}/10 on flood susceptibility. The composite score may
          not reflect this risk adequately — evaluate the flood layer and drainage evidence before
          making any housing decision in this area.
        </p>
      </div>
    </motion.div>
  );
}

// ── Panel skeleton ─────────────────────────────────────────────────────────────
function PanelSkeleton() {
  return (
    <div className="panel-skeleton" aria-label="Loading cell evidence">
      <div className="skeleton-hero"><i /><i /><i /></div>
      {[0, 1, 2, 3, 4].map((item) => <div className="skeleton-card" key={item}><i /><span><b /><b /></span><em /></div>)}
    </div>
  );
}

// ── Category summary row (above category cards, shows quick stats) ─────────────
function CategorySummaryRow({ categories }: { categories: MetricCategory[] }) {
  const scored = categories.filter((c) => c.score !== null);
  if (!scored.length) return null;
  return (
    <div className="category-summary-row" aria-label="Category scores overview">
      {scored.map((cat) => {
        const Icon = categoryIcons[cat.key] || Gauge;
        return (
          <div key={cat.key} className="category-summary-chip">
            <Icon aria-hidden="true" />
            <span>{cat.label.split(" ")[0]}</span>
            <strong style={{ color: scoreToColor(cat.score!) }}>{cat.score!.toFixed(1)}</strong>
          </div>
        );
      })}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
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

  const floodScore = cell?.metrics.floodSusceptibility.ratingOutOf10 ?? null;
  const showFloodAlert = cell?.floodAlert === true;

  // Determine which category to open by default (worst scored or environment)
  const categories = cell?.categories ?? [];
  const defaultOpenKey = categories.find((c) => c.score !== null && c.score < 5)?.key ?? "environment";

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
              <span>NEIGHBORHOOD INTELLIGENCE</span>
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
              {showFloodAlert && floodScore !== null && (
                <FloodAlert score={floodScore} />
              )}

              {/* Overall score hero */}
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
                    <motion.strong
                      key={cell.overallScore ?? "na"}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 22 }}
                    >
                      {cell.overallScore?.toFixed(1) ?? "—"}
                    </motion.strong>
                    <span>/ 10</span>
                  </div>
                </div>
                <div className="score-copy">
                  <span>NEIGHBORHOOD INTELLIGENCE SCORE</span>
                  <h2>{riskCopy(cell)}</h2>
                  <p>{Math.round(cell.confidence * 100)}% evidence confidence · {cell.sizeMeters} m × {cell.sizeMeters} m cell</p>
                </div>
              </section>

              {context && (
                <div className="place-context">
                  <MapPin aria-hidden="true" />
                  <p>Showing cell-level metrics for the area containing <strong>{context.name}</strong>. They do not describe that place itself.</p>
                </div>
              )}

              {/* Category quick-score row */}
              {categories.length > 0 && (
                <CategorySummaryRow categories={categories} />
              )}

              {/* Category cards — composite → category sub-score → feature → sourced evidence */}
              {categories.length > 0 && (
                <>
                  <div className="panel-section-title">
                    <span>Score breakdown by category</span>
                    <em>
                      {categories.filter((c) => c.score !== null).length} scored · {categories.filter((c) => c.score === null).length} context-only
                    </em>
                  </div>
                  <div className="category-list">
                    {categories.map((category, index) => (
                      <motion.div
                        key={category.key}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(0.04 * index, 0.25), duration: 0.26 }}
                      >
                        <CategoryCard
                          category={category}
                          defaultOpen={category.key === defaultOpenKey}
                        />
                      </motion.div>
                    ))}
                  </div>
                </>
              )}

              {/* Transparent scoring note */}
              <section className="score-method">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>Transparent evidence-backed scoring</strong>
                  <p>
                    Every metric shown is backed by a named, verifiable source. Low-confidence metrics are pulled toward neutral (5.0) before weighting. Context-only metrics are shown for awareness but never affect the score. Limitations are explicit at every level.
                  </p>
                </div>
                <a href="/methodology">Methodology</a>
              </section>

              <footer className="panel-disclaimer">
                <p>Metrics describe the selected geographic cell and are based on public, modelled, or derived data. They do not certify the safety, quality, or condition of any individual property, building, or resident.</p>
                <span>Updated {formatDate(cell.updatedAt)}</span>
              </footer>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
