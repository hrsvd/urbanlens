"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker,
} from "maplibre-gl";
import { CELL_OVERLAY_OPACITY } from "@/lib/constants";
import { NEUTRAL_SCORE_COLOR, SCORE_COLOR_STOPS, lighten, scoreToColor } from "@/lib/color";
import { coordinateToCell } from "@/lib/geo";
import { useMapStore } from "@/lib/store";
import type { AnalysisCell, MapBootstrap, SearchItem } from "@/lib/types";

export type MapHandle = {
  reset: () => void;
  focus: (item: SearchItem) => void;
};

type MapCanvasProps = {
  data: MapBootstrap;
  localityCenter: { latitude: number; longitude: number };
  localityName: string;
  selectedCell: AnalysisCell | null;
  regionalScores?: { airQuality: number | null; rainfall: number | null };
  onReady?: () => void;
};

const HEAT_PROPERTY: Record<string, string> = {
  overall: "heatScoreOverall",
  airQuality: "heatScoreAir",
  floodSusceptibility: "heatScoreFlood",
  drainProximity: "heatScoreDrain",
  rainfall: "heatScoreRainfall",
  estimatedNoise: "heatScoreNoise",
  connectivity: "heatScoreConnectivity",
  education: "heatScoreEducation",
  healthcare: "heatScoreHealthcare",
  transit: "heatScoreTransit",
  dailyNeeds: "heatScoreDailyNeeds",
  greenSpace: "heatScoreGreenSpace",
  safetyProxy: "heatScoreSafety",
};

function heatExpression(property: string) {
  return [
    "case",
    ["!", ["has", property]], NEUTRAL_SCORE_COLOR,
    ["==", ["get", property], null], NEUTRAL_SCORE_COLOR,
    [
      "interpolate",
      ["linear"],
      ["to-number", ["get", property]],
      ...SCORE_COLOR_STOPS.flat(),
    ],
  ] as maplibregl.ExpressionSpecification;
}

export const MapCanvas = forwardRef<MapHandle, MapCanvasProps>(function MapCanvas(
  { data, localityCenter, localityName, selectedCell, regionalScores, onReady },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const labelsRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const selectedCellId = useMapStore((state) => state.selectedCellId);
  const setSelectedCell = useMapStore((state) => state.setSelectedCell);
  const layers = useMapStore((state) => state.layers);
  const activeMetric = useMapStore((state) => state.activeMetric);

  const initialCamera = useMemo(() => ({
    center: [localityCenter.longitude, localityCenter.latitude] as [number, number],
    zoom: 14.35,
    pitch: 58,
    bearing: -24,
  }), [localityCenter.latitude, localityCenter.longitude]);

  useImperativeHandle(ref, () => ({
    reset() {
      mapRef.current?.easeTo({ ...initialCamera, duration: 1500 });
    },
    focus(item) {
      const cell = coordinateToCell(item.longitude, item.latitude, data.grid);
      if (!cell) return;
      setSelectedCell(cell.properties.id, item);
      mapRef.current?.flyTo({
        center: [item.longitude, item.latitude],
        zoom: 16.2,
        pitch: 62,
        bearing: -18,
        speed: 0.8,
        curve: 1.4,
        essential: true,
      });
    },
  }), [data.grid, setSelectedCell, initialCamera]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "space", type: "background", paint: { "background-color": "#040808" } }],
      },
      ...initialCamera,
      minZoom: 12.8,
      maxZoom: 19,
      maxPitch: 72,
      attributionControl: false,
      dragRotate: true,
      touchPitch: true,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("boundary", { type: "geojson", data: data.boundary });
      map.addSource("buildings", { type: "geojson", data: data.buildings });
      map.addSource("roads", { type: "geojson", data: data.roads });
      map.addSource("water", { type: "geojson", data: data.water });
      map.addSource("green", { type: "geojson", data: data.green });
      map.addSource("drains", { type: "geojson", data: data.drains });
      map.addSource("flood-points", { type: "geojson", data: data.floodPoints });
      map.addSource("grid", { type: "geojson", data: data.grid });
      map.addSource("selected-cell", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("hover-cell", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "hsr-shadow",
        type: "line",
        source: "boundary",
        paint: {
          "line-color": "#000000",
          "line-width": 22,
          "line-opacity": 0.5,
          "line-blur": 18,
          "line-translate": [0, 8],
        },
      });
      map.addLayer({
        id: "hsr-plinth",
        type: "fill-extrusion",
        source: "boundary",
        paint: {
          "fill-extrusion-color": "#0c1715",
          "fill-extrusion-base": 0,
          "fill-extrusion-height": 3.5,
          "fill-extrusion-opacity": 1,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "hsr-surface",
        type: "fill",
        source: "boundary",
        paint: {
          "fill-color": "#0c1514",
          "fill-opacity": 1,
        },
      });
      map.addLayer({
        id: "heatmap",
        type: "fill",
        source: "grid",
        layout: { visibility: "none" },
        paint: {
          "fill-color": heatExpression(HEAT_PROPERTY.overall),
          "fill-opacity": 0.34,
          "fill-outline-color": "rgba(218, 236, 226, 0.12)",
        },
      });
      map.addLayer({
        id: "selected-volume",
        type: "fill-extrusion",
        source: "selected-cell",
        paint: {
          // Colour reflects the cell's composite score (red↔green); kept
          // semi-transparent so buildings/roads/labels stay legible through it.
          "fill-extrusion-color": NEUTRAL_SCORE_COLOR,
          "fill-extrusion-base": 0,
          "fill-extrusion-height": 14,
          "fill-extrusion-opacity": CELL_OVERLAY_OPACITY,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "green",
        type: "fill",
        source: "green",
        paint: {
          "fill-color": "#315d4e",
          "fill-opacity": 0.72,
          "fill-outline-color": "#6c9b7f",
        },
      });
      map.addLayer({
        id: "water-fill",
        type: "fill",
        source: "water",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#26556b",
          "fill-opacity": 0.82,
          "fill-outline-color": "#65a6b7",
        },
      });
      map.addLayer({
        id: "water-line",
        type: "line",
        source: "water",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#5b9aaa",
          "line-width": 1.2,
          "line-opacity": 0.65,
        },
      });
      map.addLayer({
        id: "roads-glow",
        type: "line",
        source: "roads",
        minzoom: 13,
        layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "class"], "major"], "#d6aa68",
            "#9ab1aa",
          ],
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            13, ["case", ["==", ["get", "class"], "major"], 2.4, 0.35],
            18, ["case", ["==", ["get", "class"], "major"], 9, 2.2],
          ],
          "line-opacity": 0.24,
          "line-blur": 4,
        },
      });
      map.addLayer({
        id: "roads",
        type: "line",
        source: "roads",
        minzoom: 13,
        layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "class"], "major"], "#dfc08a",
            "#839790",
          ],
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            13, ["case", ["==", ["get", "class"], "major"], 1.2, 0.25],
            18, ["case", ["==", ["get", "class"], "major"], 4.5, 1.1],
          ],
          "line-opacity": [
            "case",
            ["==", ["get", "class"], "major"], 0.8,
            0.48,
          ],
        },
      });
      map.addLayer({
        id: "drains-glow",
        type: "line",
        source: "drains",
        layout: { visibility: "visible", "line-cap": "round" },
        paint: {
          "line-color": "#67c0ce",
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 18, 3],
          "line-opacity": 0.52,
          "line-blur": 1.2,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "grid-lines",
        type: "line",
        source: "grid",
        layout: { visibility: "visible" },
        paint: {
          "line-color": "#a3c4ba",
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.22, 18, 0.8],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.12, 16, 0.32],
        },
      });
      map.addLayer({
        id: "buildings",
        type: "fill-extrusion",
        source: "buildings",
        minzoom: 13.4,
        layout: { visibility: "visible" },
        paint: {
          // Apartment footprints get a distinct warm tint; other buildings shade
          // from dark low-rise to lighter high-rise for stronger height contrast.
          "fill-extrusion-color": [
            "case",
            ["==", ["get", "class"], "apartments"],
            [
              "interpolate", ["linear"], ["coalesce", ["get", "height"], 10],
              10, "#5b5a54",
              24, "#7d7666",
              48, "#a99a7f",
            ],
            [
              "interpolate", ["linear"], ["coalesce", ["get", "height"], 10],
              6, "#2f4148",
              14, "#465f63",
              26, "#6c8781",
              48, "#9fb6a8",
            ],
          ],
          "fill-extrusion-base": 0,
          // Slight vertical exaggeration sharpens the skyline read on a dark scene.
          "fill-extrusion-height": ["*", ["coalesce", ["get", "height"], 10], 1.12],
          "fill-extrusion-opacity": 0.93,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "flood-points",
        type: "circle",
        source: "flood-points",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 4, 18, 10],
          "circle-color": "#d3977d",
          "circle-stroke-color": "#f3c2a3",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.72,
        },
      });
      map.addLayer({
        id: "hover-fill",
        type: "fill",
        source: "hover-cell",
        paint: {
          "fill-color": "#dff3ea",
          "fill-opacity": 0.08,
          "fill-outline-color": "rgba(223, 243, 234, 0.4)",
        },
      });
      map.addLayer({
        id: "selected-outline",
        type: "line",
        source: "selected-cell",
        paint: {
          // Bright, near-constant edge keeps the selected cell separable from the
          // heatmap surface even when the fill colour sits mid-scale.
          "line-color": "#f2fbf5",
          "line-width": 2.6,
          "line-opacity": 0.95,
          "line-blur": 0.3,
        },
      });

      const labelItems = data.searchIndex
        .filter((item) =>
          ["park", "garden", "hospital", "school", "college", "bus_station", "place_of_worship", "lake"]
            .some((kind) => item.kind.includes(kind)),
        )
        .slice(0, 38);
      labelItems.forEach((item) => {
        const element = document.createElement("div");
        element.className = "map-place-label";
        element.textContent = item.name;
        element.setAttribute("aria-hidden", "true");
        labelsRef.current.push(
          new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map),
        );
      });

      map.on("click", (event) => {
        const cell = coordinateToCell(event.lngLat.lng, event.lngLat.lat, data.grid);
        if (!cell) return;
        setSelectedCell(cell.properties.id, null);
        map.easeTo({
          center: [cell.properties.centerLongitude, cell.properties.centerLatitude],
          zoom: Math.max(map.getZoom(), 15.5),
          pitch: Math.max(map.getPitch(), 55),
          duration: 900,
          essential: true,
        });
      });
      let hoveredCellId: string | null = null;
      map.on("mousemove", (event) => {
        const cell = coordinateToCell(event.lngLat.lng, event.lngLat.lat, data.grid);
        map.getCanvas().style.cursor = cell ? "crosshair" : "grab";
        const nextId = cell?.properties.id ?? null;
        if (nextId === hoveredCellId) return;
        hoveredCellId = nextId;
        const hoverSource = map.getSource("hover-cell") as GeoJSONSource | undefined;
        hoverSource?.setData({ type: "FeatureCollection", features: cell ? [cell] : [] });
      });
      map.on("mouseout", () => {
        hoveredCellId = null;
        (map.getSource("hover-cell") as GeoJSONSource | undefined)?.setData({
          type: "FeatureCollection",
          features: [],
        });
      });

      setMapReady(true);
      onReady?.();
    });

    return () => {
      labelsRef.current.forEach((marker) => marker.remove());
      labelsRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [data, initialCamera, onReady, setSelectedCell]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const cell = data.grid.features.find((feature) => feature.properties.id === selectedCellId);
    const source = map.getSource("selected-cell") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: cell ? [cell] : [],
    });
    // Diverging red↔green fill by composite score; a lightened tint glows at the
    // base while the bright outline stays constant for separability.
    const color = scoreToColor(selectedCell?.overallScore ?? null);
    map.setPaintProperty("selected-volume", "fill-extrusion-color", color);
    map.setPaintProperty("selected-outline", "line-color", lighten(color, 0.72));
  }, [data.grid, mapReady, selectedCell, selectedCellId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const layerMap = {
      buildings: ["buildings"],
      roads: ["roads", "roads-glow"],
      drains: ["drains-glow"],
      floodPoints: ["flood-points"],
      grid: ["grid-lines"],
      heatmap: ["heatmap"],
    } as const;
    Object.entries(layerMap).forEach(([key, ids]) => {
      ids.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", layers[key as keyof typeof layerMap] ? "visible" : "none");
      });
    });
    labelsRef.current.forEach((marker) => {
      marker.getElement().style.display = layers.labels ? "" : "none";
    });
  }, [layers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const decorated = {
      ...data.grid,
      features: data.grid.features.map((feature) => {
        const regionalAir = regionalScores?.airQuality ?? null;
        const regionalRain = regionalScores?.rainfall ?? null;
        const staticScore = (feature.properties as unknown as { overallStatic?: number | null }).overallStatic ?? null;
        const dynamicValues = [staticScore, regionalAir, regionalRain].filter((value): value is number => value !== null);
        const overall = dynamicValues.length
          ? Number((dynamicValues.reduce((sum, value) => sum + value, 0) / dynamicValues.length).toFixed(1))
          : staticScore;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            heatScoreAir: regionalAir,
            heatScoreRainfall: regionalRain,
            heatScoreOverall: overall,
          },
        };
      }),
    };
    (map.getSource("grid") as GeoJSONSource | undefined)?.setData(decorated);
  }, [data.grid, mapReady, regionalScores]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.setPaintProperty("heatmap", "fill-color", heatExpression(HEAT_PROPERTY[activeMetric]));
  }, [activeMetric, mapReady]);

  return (
    <div className="map-canvas-wrap">
      <div ref={containerRef} className="map-canvas" aria-label={`Interactive 3D map of ${localityName}`} />
      <div className="map-vignette" aria-hidden="true" />
      <div className="map-attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
        <span>·</span>
        <a href="/data-sources">Data ledger</a>
      </div>
    </div>
  );
});
