"use client";

import { create } from "zustand";
import { DEFAULT_LOCALITY_ID } from "./constants";
import type { LocalityId } from "./constants";
import type { LayerVisibility, MetricKey, SearchItem } from "./types";

type MapState = {
  activeLocality: LocalityId;
  selectedCellId: string | null;
  selectedContext: SearchItem | null;
  panelOpen: boolean;
  activeMetric: MetricKey;
  layers: LayerVisibility;
  setActiveLocality: (localityId: LocalityId) => void;
  setSelectedCell: (cellId: string | null, context?: SearchItem | null) => void;
  setPanelOpen: (open: boolean) => void;
  setActiveMetric: (metric: MetricKey) => void;
  toggleLayer: (key: keyof LayerVisibility) => void;
};

export const useMapStore = create<MapState>((set) => ({
  activeLocality: DEFAULT_LOCALITY_ID,
  selectedCellId: null,
  selectedContext: null,
  panelOpen: false,
  activeMetric: "overall",
  layers: {
    buildings: true,
    labels: true,
    roads: true,
    drains: true,
    floodPoints: false,
    grid: true,
    heatmap: false,
  },
  // Switching locality closes the panel and clears the selected cell so stale
  // cell data from the previous locality doesn't show through.
  setActiveLocality: (activeLocality) =>
    set({ activeLocality, selectedCellId: null, selectedContext: null, panelOpen: false }),
  setSelectedCell: (selectedCellId, selectedContext = null) =>
    set({ selectedCellId, selectedContext, panelOpen: Boolean(selectedCellId) }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setActiveMetric: (activeMetric) =>
    set((state) => ({ activeMetric, layers: { ...state.layers, heatmap: true } })),
  toggleLayer: (key) =>
    set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),
}));
