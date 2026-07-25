import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { DEFAULT_WEIGHTS } from "@/lib/constants";

export const metadata: Metadata = { title: "Methodology" };

const weights = [
  ["Flood susceptibility", DEFAULT_WEIGHTS.floodSusceptibility],
  ["Air quality", DEFAULT_WEIGHTS.airQuality],
  ["Drain context", DEFAULT_WEIGHTS.drainProximity],
  ["Rainfall context", DEFAULT_WEIGHTS.rainfall],
  ["Estimated noise", DEFAULT_WEIGHTS.estimatedNoise],
  ["Connectivity", DEFAULT_WEIGHTS.connectivity],
];

export default function MethodologyPage() {
  return (
    <InfoPage
      eyebrow="Open methodology · v0.1"
      title="An indicator, not a verdict."
      intro="HSR is divided into projected 100 m squares. Every score describes one geographic cell, exposes its evidence, and keeps uncertainty visible."
    >
      <section id="grid">
        <span className="section-index">01</span>
        <div>
          <h2>The analysis grid</h2>
          <p>
            Grid edges are generated in Web Mercator metres, aligned consistently, then cells whose centres
            fall inside the OSM HSR locality boundary are retained. The configured size is <strong>100 m × 100 m</strong>.
            Boundary-edge cells remain full squares so the unit of analysis never quietly changes.
          </p>
          <div className="formula-card">
            <code>cell = square(projected_x, projected_y, 100 m)</code>
            <span>Coordinate → containing polygon → cell ID</span>
          </div>
        </div>
      </section>

      <section id="score">
        <span className="section-index">02</span>
        <div>
          <h2>Overall score</h2>
          <p>
            Available metric ratings are combined with configurable weights. Missing metrics are omitted—not
            replaced with zero—and the remaining weights are re-normalised. Coverage and source confidence
            reduce the reported confidence; they only modestly adjust the visible score.
          </p>
          <div className="formula-card accent">
            <code>Σ(scoreᵢ × normalised_weightᵢ) × evidence adjustment</code>
            <span>7.5–10 lower observed risk · 5–7.4 mixed signals · below 5 higher observed risk</span>
          </div>
          <div className="weight-grid">
            {weights.map(([label, weight]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>{Math.round(Number(weight) * 100)}%</strong>
                <i style={{ "--weight": Number(weight) } as React.CSSProperties} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="flood">
        <span className="section-index">03</span>
        <div>
          <h2>Flood susceptibility</h2>
          <p>
            The current model combines distance to imported flood-vulnerability locations, distance to mapped
            drains and surface water, plus recent-model and forecast rainfall. Drain proximity contributes
            modestly and is never treated as proof of danger. Relative elevation and local slope are derived
            from 90 m Copernicus DEM samples, which cannot resolve kerbs, basements, or building pads.
          </p>
          <aside className="limit-note">
            <strong>Deliberate limitation</strong>
            <p>The model says “elevated susceptibility,” never “this area will flood.” It cannot describe basements, drainage condition, or a particular building.</p>
          </aside>
        </div>
      </section>

      <section id="noise">
        <span className="section-index">04</span>
        <div>
          <h2>Estimated environmental noise</h2>
          <p>
            A low-confidence proxy uses major-road distance, commercial and high-footfall mapped places, bus
            stops, and construction tags. There is no HSR-wide street-level public sound sensor dataset, so the
            interface never presents decibels or claims a live measurement.
          </p>
        </div>
      </section>

      <section id="confidence">
        <span className="section-index">05</span>
        <div>
          <h2>Confidence and missing data</h2>
          <p>
            Confidence represents evidence fitness, spatial resolution, coverage, and model status—not the
            probability that the score is “correct.” Modelled regional air data receives lower geographic
            confidence than mapped local geometry. Unavailable network-quality data remains explicitly unknown
            and is excluded from the overall score.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
