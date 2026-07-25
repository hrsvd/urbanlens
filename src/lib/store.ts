"use client";

import { create } from "zustand";
import type { LayerVisibility, MetricKey, SearchItem } from "./types";

type MapState = {
  selectedCellId: string | null;
  selectedContext: SearchItem | null;
  panelOpen: boolean;
  activeMetric: MetricKey;
  layers: LayerVisibility;
  setSelectedCell: (cellId: string | null, context?: SearchItem | null) => void;
  setPanelOpen: (open: boolean) => void;
  setActiveMetric: (metric: MetricKey) => void;
  toggleLayer: (key: keyof LayerVisibility) => void;
};

export const useMapStore = create<MapState>((set) => ({
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
  setSelectedCell: (selectedCellId, selectedContext = null) =>
    set({ selectedCellId, selectedContext, panelOpen: Boolean(selectedCellId) }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setActiveMetric: (activeMetric) =>
    set((state) => ({ activeMetric, layers: { ...state.layers, heatmap: true } })),
  toggleLayer: (key) =>
    set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),
}));
