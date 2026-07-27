import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "API reference" };

const endpoints = [
  ["GET", "/api/map/bootstrap?locality=", "Complete map payload and grid metadata for the specified locality"],
  ["GET", "/api/map/buildings", "Clipped building footprints"],
  ["GET", "/api/map/roads", "Clipped road centre-lines"],
  ["GET", "/api/map/landmarks", "Named points of interest for the active locality"],
  ["GET", "/api/map/grid", "100 m analysis cells and static features"],
  ["GET", "/api/cells/:cellId", "Cell geometry and static evidence"],
  ["GET", "/api/cells/:cellId/metrics", "Scored evidence with dynamic model context"],
  ["GET", "/api/search?q=", "Cross-locality cached place index"],
  ["GET", "/api/data-sources", "Machine-readable source ledger"],
  ["GET", "/api/health", "Service health"],
];

export default function ApiDocsPage() {
  return (
    <InfoPage
      eyebrow="Internal API · v0.1"
      title="Small, inspectable endpoints."
      intro="Static geometry is preprocessed; dynamic upstream requests are validated, bucketed, cached, and allowed to fail partially."
    >
      <div className="api-list">
        {endpoints.map(([method, route, description]) => (
          <div key={route}>
            <span>{method}</span>
            <code>{route}</code>
            <p>{description}</p>
          </div>
        ))}
      </div>
    </InfoPage>
  );
}
