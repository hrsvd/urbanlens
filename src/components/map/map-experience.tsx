"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Bot, Database, LayoutGrid, TriangleAlert } from "lucide-react";
import { LOCALITIES } from "@/lib/constants";
import type { LocalityId } from "@/lib/constants";
import { haversineDistanceMeters } from "@/lib/geo";
import { useMapStore } from "@/lib/store";
import type { AnalysisCell, MapBootstrap, SearchItem } from "@/lib/types";
import { HelpDialog } from "./help-dialog";
import { HomeAssistant } from "./home-assistant";
import { IntelligencePanel } from "./intelligence-panel";
import { LocalitySwitcher } from "./locality-switcher";
import { MapCanvas, type MapHandle } from "./map-canvas";
import { MapControls } from "./map-controls";
import { MapLegend } from "./map-legend";
import { MapLoader } from "./map-loader";
import { SearchBar } from "./search-bar";
import { SupportPanel } from "./support-panel";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

// Localities for which a bootstrap file exists are shown in the switcher.
// This list is determined by attempting to load each bootstrap at runtime —
// but for the initial render we optimistically show all registered localities
// and let the map canvas surface an error only if the file is truly missing.
const ALL_LOCALITY_IDS = Object.keys(LOCALITIES) as LocalityId[];

export function MapExperience() {
  const mapRef = useRef<MapHandle>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [progress, setProgress] = useState(12);
  const [helpOpen, setHelpOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const activeLocality = useMapStore((state) => state.activeLocality);
  const setActiveLocality = useMapStore((state) => state.setActiveLocality);
  const selectedCellId = useMapStore((state) => state.selectedCellId);
  const localityConfig = LOCALITIES[activeLocality];

  // Reset loader state during render when locality changes (derived state pattern).
  const [snapshotLocality, setSnapshotLocality] = useState(activeLocality);
  if (snapshotLocality !== activeLocality) {
    setSnapshotLocality(activeLocality);
    setMapReady(false);
    setLoaderVisible(true);
    setProgress(12);
  }

  const bootstrapQuery = useQuery({
    queryKey: ["map-bootstrap", activeLocality],
    queryFn: () => getJson<MapBootstrap>(`/api/map/bootstrap?locality=${activeLocality}`),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (bootstrapQuery.isLoading) {
      const timer = window.setInterval(() => setProgress((value) => Math.min(56, value + 3)), 180);
      return () => window.clearInterval(timer);
    }
  }, [bootstrapQuery.isLoading]);

  useEffect(() => {
    if (!mapReady) return;
    const timer = window.setTimeout(() => setLoaderVisible(false), 520);
    return () => window.clearTimeout(timer);
  }, [mapReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("ul-search")?.focus();
      }
      if (event.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const centerCellId = useMemo(() => {
    if (!bootstrapQuery.data) return null;
    const center = localityConfig.center;
    return bootstrapQuery.data.grid.features.reduce((closest, cell) => {
      const distance = haversineDistanceMeters(
        center,
        { latitude: cell.properties.centerLatitude, longitude: cell.properties.centerLongitude },
      );
      return !closest || distance < closest.distance
        ? { id: cell.properties.id, distance }
        : closest;
    }, null as { id: string; distance: number } | null)?.id ?? null;
  }, [bootstrapQuery.data, localityConfig.center]);

  const regionalQuery = useQuery({
    queryKey: ["cell-metrics", centerCellId],
    queryFn: () => getJson<AnalysisCell>(`/api/cells/${centerCellId}/metrics`),
    enabled: Boolean(centerCellId),
    staleTime: 15 * 60 * 1000,
  });

  const selectedQuery = useQuery({
    queryKey: ["cell-metrics", selectedCellId],
    queryFn: () => getJson<AnalysisCell>(`/api/cells/${selectedCellId}/metrics`),
    enabled: Boolean(selectedCellId),
    staleTime: 15 * 60 * 1000,
  });

  const pendingFocusRef = useRef<SearchItem | null>(null);

  const onMapReady = useCallback(() => setMapReady(true), []);

  // After a cross-locality search switches the active locality, the map
  // re-initialises with new data; consume the pending focus once it's ready.
  useEffect(() => {
    if (mapReady && pendingFocusRef.current) {
      mapRef.current?.focus(pendingFocusRef.current);
      pendingFocusRef.current = null;
    }
  }, [mapReady]);

  const onSearchSelect = useCallback((item: SearchItem) => {
    const targetLocality = (item.localityId ?? activeLocality) as LocalityId;
    if (targetLocality !== activeLocality) {
      // Item is in a different locality — switch first, focus after map reload.
      pendingFocusRef.current = item;
      setActiveLocality(targetLocality);
    } else {
      mapRef.current?.focus(item);
    }
  }, [activeLocality, setActiveLocality]);

  if (bootstrapQuery.isError) {
    return (
      <main className="map-fatal">
        <TriangleAlert aria-hidden="true" />
        <span>LOCAL MAP ARTIFACT UNAVAILABLE</span>
        <h1>{localityConfig.displayName} could not be loaded.</h1>
        <p>
          Run <code>npm run data:ingest -- --locality {activeLocality}</code>, then restart the development server.
          No synthetic map has been substituted.
        </p>
      </main>
    );
  }

  return (
    <main className="map-shell">
      <MapLoader
        visible={loaderVisible}
        progress={mapReady ? 100 : bootstrapQuery.isLoading ? progress : 76}
      />
      {bootstrapQuery.data && (
        <MapCanvas
          ref={mapRef}
          data={bootstrapQuery.data}
          localityCenter={localityConfig.center}
          localityName={localityConfig.displayName}
          selectedCell={selectedQuery.data ?? null}
          regionalScores={{
            airQuality: regionalQuery.data?.metrics.airQuality.ratingOutOf10 ?? null,
            rainfall: regionalQuery.data?.metrics.rainfall.ratingOutOf10 ?? null,
          }}
          onReady={onMapReady}
        />
      )}

      <header className="map-header">
        <Link className="brand map-brand" href="/" aria-label="UrbanLens Bengaluru">
          <span className="brand-mark"><LayoutGrid aria-hidden="true" /></span>
          <span><strong>URBAN</strong><em>LENS</em></span>
        </Link>
        <SearchBar onSelect={onSearchSelect} />
        <nav aria-label="Project pages">
          <Link href="/methodology">Method</Link>
          <Link href="/data-sources">Sources</Link>
          <Link href="/about">About</Link>
        </nav>
        <div className="live-status">
          <i className={regionalQuery.isError ? "partial" : ""} />
          <span>{regionalQuery.isError ? "STATIC DATA ONLY" : "EVIDENCE ONLINE"}</span>
        </div>
      </header>

      {bootstrapQuery.data && (
        <div className="map-dataset-badge">
          <Database aria-hidden="true" />
          <span><strong>{bootstrapQuery.data.meta.counts.buildings.toLocaleString("en-IN")}</strong> buildings</span>
          <i />
          <span><strong>{bootstrapQuery.data.meta.counts.gridCells}</strong> cells</span>
          <i />
          <span className="scope">{localityConfig.displayName}</span>
        </div>
      )}

      {/* Locality switcher — body of the screen, not the header */}
      <LocalitySwitcher availableLocalities={ALL_LOCALITY_IDS} />

      <MapControls onReset={() => mapRef.current?.reset()} onHelp={() => setHelpOpen(true)} />
      <MapLegend />
      <IntelligencePanel
        cell={selectedQuery.data ?? null}
        loading={selectedQuery.isLoading}
        error={selectedQuery.isError}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SupportPanel open={supportOpen} onClose={() => setSupportOpen(false)} />
      <HomeAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      {/* Credit + support — fixed bottom-left, above OSM attribution */}
      <div className="map-credit">
        <a
          href="https://github.com/hrsvd"
          target="_blank"
          rel="noreferrer"
          className="map-credit-author"
        >
          Made with ♥ by Harsh
        </a>
        <button
          type="button"
          className="map-credit-support"
          onClick={() => setSupportOpen(true)}
        >
          Support
        </button>
        <button
          type="button"
          className="map-credit-assistant"
          onClick={() => setAssistantOpen(true)}
          aria-label="Open intelligence assistant"
        >
          <Bot size={12} aria-hidden="true" />
          Ask AI
        </button>
      </div>

      <div className="map-instruction" aria-hidden="true">
        <span>CLICK A CELL TO INSPECT</span>
        <i />
        <span>RIGHT-DRAG TO ORBIT</span>
      </div>
    </main>
  );
}
