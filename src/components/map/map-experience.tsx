"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Box, Database, Radio, TriangleAlert } from "lucide-react";
import { HSR_CENTER } from "@/lib/constants";
import { haversineDistanceMeters } from "@/lib/geo";
import { useMapStore } from "@/lib/store";
import type { AnalysisCell, MapBootstrap, SearchItem } from "@/lib/types";
import { HelpDialog } from "./help-dialog";
import { IntelligencePanel } from "./intelligence-panel";
import { MapCanvas, type MapHandle } from "./map-canvas";
import { MapControls } from "./map-controls";
import { MapLegend } from "./map-legend";
import { MapLoader } from "./map-loader";
import { SearchBar } from "./search-bar";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function MapExperience() {
  const mapRef = useRef<MapHandle>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [progress, setProgress] = useState(12);
  const [helpOpen, setHelpOpen] = useState(false);
  const selectedCellId = useMapStore((state) => state.selectedCellId);

  const bootstrapQuery = useQuery({
    queryKey: ["map-bootstrap"],
    queryFn: () => getJson<MapBootstrap>("/api/map/bootstrap"),
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
        document.getElementById("hsr-search")?.focus();
      }
      if (event.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const centerCellId = useMemo(() => {
    if (!bootstrapQuery.data) return null;
    return bootstrapQuery.data.grid.features.reduce((closest, cell) => {
      const distance = haversineDistanceMeters(
        HSR_CENTER,
        { latitude: cell.properties.centerLatitude, longitude: cell.properties.centerLongitude },
      );
      return !closest || distance < closest.distance
        ? { id: cell.properties.id, distance }
        : closest;
    }, null as { id: string; distance: number } | null)?.id ?? null;
  }, [bootstrapQuery.data]);

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

  const onMapReady = useCallback(() => setMapReady(true), []);
  const onSearchSelect = useCallback((item: SearchItem) => mapRef.current?.focus(item), []);

  if (bootstrapQuery.isError) {
    return (
      <main className="map-fatal">
        <TriangleAlert aria-hidden="true" />
        <span>LOCAL MAP ARTIFACT UNAVAILABLE</span>
        <h1>HSR could not be assembled.</h1>
        <p>Run <code>npm run data:ingest</code>, then restart the development server. No synthetic map has been substituted.</p>
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
          selectedCell={selectedQuery.data ?? null}
          regionalScores={{
            airQuality: regionalQuery.data?.metrics.airQuality.ratingOutOf10 ?? null,
            rainfall: regionalQuery.data?.metrics.rainfall.ratingOutOf10 ?? null,
          }}
          onReady={onMapReady}
        />
      )}

      <header className="map-header">
        <Link className="brand map-brand" href="/" aria-label="HSR Intelligence Map">
          <span className="brand-mark"><Box aria-hidden="true" /></span>
          <span><strong>HSR</strong><em>INTELLIGENCE MAP</em></span>
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
          <span className="scope"><Radio aria-hidden="true" /> HSR ONLY</span>
        </div>
      )}

      <MapControls onReset={() => mapRef.current?.reset()} onHelp={() => setHelpOpen(true)} />
      <MapLegend />
      <IntelligencePanel
        cell={selectedQuery.data ?? null}
        loading={selectedQuery.isLoading}
        error={selectedQuery.isError}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <div className="map-instruction" aria-hidden="true">
        <span>CLICK A CELL TO INSPECT</span>
        <i />
        <span>RIGHT-DRAG TO ORBIT</span>
      </div>
    </main>
  );
}
