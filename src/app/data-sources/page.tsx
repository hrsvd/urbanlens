import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { InfoPage } from "@/components/info-page";
import { DATA_SOURCES } from "@/lib/data-sources";

export const metadata: Metadata = { title: "Data sources" };

export default function DataSourcesPage() {
  return (
    <InfoPage
      eyebrow={`${DATA_SOURCES.length} source records · open ledger`}
      title="Evidence has an address."
      intro="Every visible signal names its provider, spatial resolution, refresh policy, and known limitations. No missing source is replaced by a fabricated value."
    >
      <div className="source-ledger">
        {DATA_SOURCES.map((source, index) => (
          <article key={source.id} className="source-record">
            <div className="source-number">{String(index + 1).padStart(2, "0")}</div>
            <div className="source-main">
              <div className="source-title-row">
                <div>
                  <span className={`source-type ${source.classification}`}>{source.classification}</span>
                  <h2>{source.dataset}</h2>
                </div>
                <a href={source.sourceUrl} target={source.sourceUrl.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                  Source <ExternalLink aria-hidden="true" />
                </a>
              </div>
              <p>{source.provider}</p>
              <dl>
                <div><dt>Used for</dt><dd>{source.purpose}</dd></div>
                <div><dt>Resolution</dt><dd>{source.resolution}</dd></div>
                <div><dt>Refresh</dt><dd>{source.refresh}</dd></div>
                <div><dt>License</dt><dd>{source.license}</dd></div>
              </dl>
              <div className="limitation"><strong>Known limitation</strong>{source.limitations}</div>
            </div>
          </article>
        ))}
      </div>
    </InfoPage>
  );
}
