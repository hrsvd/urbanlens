import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Map, Scale, ShieldCheck } from "lucide-react";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About the project"
      title="A clearer way to read a neighbourhood."
      intro="HSR Intelligence Map is a public exploration prototype for environmental and infrastructure evidence—spatially honest, source-aware, and intentionally limited to HSR Layout."
    >
      <div className="principle-grid">
        <article><Map /><span>01</span><h2>Place first</h2><p>The map is built from actual geographic geometry and keeps the neighbourhood itself as the interface.</p></article>
        <article><Scale /><span>02</span><h2>Evidence in context</h2><p>Each signal shows resolution and uncertainty so regional models are never mistaken for street sensors.</p></article>
        <article><ShieldCheck /><span>03</span><h2>No property verdicts</h2><p>The unit of analysis is always a 100 m cell. No apartment, building, resident, or street is certified safe or unsafe.</p></article>
      </div>
      <section>
        <span className="section-index">NOW</span>
        <div>
          <h2>Current scope</h2>
          <p>
            The MVP covers HSR Layout, Bengaluru. It renders locally ingested OSM geometry, BBMP/OpenCity
            drain and flood evidence, and cached modelled weather and air-quality context. There is no account,
            tracking, payment, resident reporting, or property scoring.
          </p>
          <Link className="text-link" href="/">
            Explore the map <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section>
        <span className="section-index">NEXT</span>
        <div>
          <h2>What belongs in a next version</h2>
          <p>
            A verified elevation subset, time-series environmental context, opt-in community network tests,
            source-version diffs, and cell-to-cell comparison. Expansion to another locality should happen only
            after the HSR data contracts and limitations are proven useful.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
