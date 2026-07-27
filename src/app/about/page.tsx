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
      intro="UrbanLens Bengaluru is an evidence-led livability exploration tool covering major Bengaluru localities — spatially honest, source-aware, and intentionally transparent about data limitations."
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
            UrbanLens covers eight major Bengaluru localities: HSR Layout, Koramangala, Indiranagar,
            Whitefield, JP Nagar, Marathahalli, Bellandur, and Hebbal. Each locality is rendered from
            locally ingested OSM geometry, BBMP/OpenCity drain and flood evidence where available, and
            cached modelled weather and air-quality context. Every 100 m cell is scored across environmental,
            infrastructure and livability access signals — schools, healthcare, public transport, daily-needs
            retail and parks — with every sub-score, weight and contribution shown. Search accepts a full
            pasted address and resolves it to the right cell across all localities. There is no account,
            tracking, payment, resident reporting, or property scoring.
          </p>
          <Link className="text-link" href="/">
            Explore the map <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section>
        <span className="section-index">DATA HONESTY</span>
        <div>
          <h2>What we cannot tell you</h2>
          <p>
            BBMP drain and flood KML coverage varies across localities — where data does not cover a locality,
            the flood model says so rather than silently extrapolating. Crime data remains city-level only (no
            ward or locality breakdown exists publicly). Air quality uses a 45 km atmospheric model grid across
            all of Bengaluru unless a nearby CPCB station is available. All of these limitations are shown
            explicitly in each metric card.
          </p>
        </div>
      </section>
      <section>
        <span className="section-index">NEXT</span>
        <div>
          <h2>What belongs in a next version</h2>
          <p>
            Cell-level NDVI from Sentinel-2, time-series environmental context, opt-in community network tests,
            source-version diffs, cell-to-cell comparison across localities, and expansion to further areas
            as OSM boundary quality improves.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
