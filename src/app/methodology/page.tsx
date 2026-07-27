import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { DEFAULT_WEIGHTS } from "@/lib/constants";

export const metadata: Metadata = { title: "Methodology" };

const scoredWeights = [
  ["Flood susceptibility", DEFAULT_WEIGHTS.floodSusceptibility],
  ["Air quality", DEFAULT_WEIGHTS.airQuality],
  ["Healthcare access", DEFAULT_WEIGHTS.healthcare],
  ["Public transport", DEFAULT_WEIGHTS.transit],
  ["Local walkability", DEFAULT_WEIGHTS.connectivity],
  ["Schools access", DEFAULT_WEIGHTS.education],
  ["Daily-needs retail", DEFAULT_WEIGHTS.dailyNeeds],
  ["Parks & green space", DEFAULT_WEIGHTS.greenSpace],
  ["Rainfall context", DEFAULT_WEIGHTS.rainfall],
];

const contextOnly = [
  "Drain network proximity (flood model input, not scored separately)",
  "Major road proximity (road-distance fact, not a noise score)",
  "Police station proximity (distance fact, not a crime indicator)",
  "Electricity reliability — KERC zone-level SAIDI/SAIFI (zone aggregate, not scored)",
  "Network quality (no open 100 m dataset available)",
];

export default function MethodologyPage() {
  return (
    <InfoPage
      eyebrow="Open methodology · v0.2"
      title="An indicator, not a verdict."
      intro="Each covered locality is divided into projected 100 m squares. Every score describes one geographic cell across environmental, infrastructure and livability signals, exposes its evidence, weight and contribution, and keeps uncertainty visible."
    >
      <section id="grid">
        <span className="section-index">01</span>
        <div>
          <h2>The analysis grid</h2>
          <p>
            Grid edges are generated in Web Mercator metres, aligned consistently, then cells whose centres
            fall inside the OSM locality boundary are retained. The configured size is <strong>100 m × 100 m</strong>.
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
            Each metric&apos;s rating is adjusted toward a neutral baseline (5.0) proportional to its
            uncertainty <em>before</em> weighting. A metric with confidence 0.30 and score 7.0 contributes
            an adjusted rating of 5.6, not 7.0. Missing metrics are omitted entirely — never zeroed.
          </p>
          <div className="formula-card accent">
            <code>adjusted = raw × confidence + 5.0 × (1 − confidence)</code>
            <span>Then: Σ(adjustedᵢ × normalised_weightᵢ). Coverage reduces overall confidence.</span>
          </div>
          <h3>Scored metrics</h3>
          <div className="weight-grid">
            {scoredWeights.map(([label, weight]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>{Math.round(Number(weight) * 100)}%</strong>
                <i style={{ "--weight": Number(weight) } as React.CSSProperties} />
              </div>
            ))}
          </div>
          <h3>Context-only metrics (displayed but not scored)</h3>
          <ul className="context-list">
            {contextOnly.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section id="flood">
        <span className="section-index">03</span>
        <div>
          <h2>Flood susceptibility</h2>
          <p>
            The model combines distance to imported flood-vulnerability locations, distance to mapped
            drains and surface water, plus recent-model and forecast rainfall. Drain proximity contributes
            modestly and is never treated as proof of danger. Relative elevation and local slope are derived
            from 90 m Copernicus DEM samples, which cannot resolve kerbs, basements, or building pads.
          </p>
          <p>
            When the flood susceptibility score falls below 3.5 (high-risk territory), a prominent alert
            is shown in the panel <strong>in addition to</strong> the composite score. The alert ensures
            that high flood risk cannot be silently averaged away by other well-scoring metrics.
          </p>
          <aside className="limit-note">
            <strong>Coverage caveat</strong>
            <p>BBMP flood-evidence point coverage varies by locality. Absence of a nearby point does not mean no flood risk exists.</p>
          </aside>
        </div>
      </section>

      <section id="air">
        <span className="section-index">04</span>
        <div>
          <h2>Air quality</h2>
          <p>
            When a CPCB API key is configured, real PM2.5 readings from the nearest
            CPCB/KSPCB monitoring station (BTM Layout, Silk Board, or Hebbal) are used.
            Confidence rises to 0.72 for station data vs. 0.55 for the 45 km CAMS atmospheric model
            which is the no-key fallback. Even a monitoring station 3–8 km away cannot capture
            street-level variation across a locality.
          </p>
        </div>
      </section>

      <section id="walkability">
        <span className="section-index">05</span>
        <div>
          <h2>Local walkability</h2>
          <p>
            Replaces the older road-length connectivity formula. Measures destination diversity — how many
            categories of daily essentials are reachable on foot with distance decay:
          </p>
          <div className="formula-card">
            <code>transit(2.5) + dailyNeeds(2.5) + healthcare(1.5) + greenSpace(1.5) + education(1.5) + bonus(0.5)</code>
            <span>Each category contributes its maximum points at near distance (150–200 m), tapering to 0 at far (500–800 m)</span>
          </div>
        </div>
      </section>

      <section id="livability">
        <span className="section-index">06</span>
        <div>
          <h2>Livability access</h2>
          <p>
            Schools, healthcare, public transport, daily-needs retail and parks are scored as
            <strong> access proxies</strong> from OpenStreetMap points: nearest-feature distance plus density
            within a 400–600 m radius, converted to 0–10 where closer and denser scores higher. Namma Metro
            stations lift the transport score where they are near. These describe how well a 100 m cell is
            served — never the quality of a specific school, hospital, shop or park.
          </p>
        </div>
      </section>

      <section id="context">
        <span className="section-index">07</span>
        <div>
          <h2>Context-only signals</h2>
          <p>
            Three metrics previously scored have been removed from the composite because their data
            cannot support a trustworthy score at 100 m resolution:
          </p>
          <ul>
            <li><strong>Police proximity</strong> — distance to a police station has no demonstrated correlation with local crime rates. Karnataka crime data is city/district-level only.</li>
            <li><strong>Drain proximity</strong> — ambiguous signal (infrastructure vs. flood exposure); it feeds the flood model as an input instead.</li>
            <li><strong>Road proximity</strong> — no decibel measurements exist; only the factual distance is shown.</li>
          </ul>
          <p>
            KERC Annual Performance Review 2023-24 SAIDI/SAIFI values for BESCOM Bengaluru South zone
            are displayed as zone-level electricity reliability context. They are not scored because
            individual feeder reliability varies and real-time outage data is not publicly available.
          </p>
        </div>
      </section>

      <section id="confidence">
        <span className="section-index">08</span>
        <div>
          <h2>Confidence and missing data</h2>
          <p>
            Confidence represents evidence fitness, spatial resolution, coverage, and model status — not the
            probability that the score is &ldquo;correct.&rdquo; Each metric&apos;s adjusted rating is
            <code> raw × confidence + 5.0 × (1 − confidence)</code>. A metric with confidence 0.55
            and score 8.0 contributes 6.65, not 8.0. This is visible in the &ldquo;Why this score&rdquo; breakdown.
            A source outage results in an unavailable metric, never a carried-forward random value.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
