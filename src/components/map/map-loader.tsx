"use client";

import { AnimatePresence, motion } from "framer-motion";

export function MapLoader({ visible, progress = 0 }: { visible: boolean; progress?: number }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="map-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="loader-orbit" aria-hidden="true"><i /><i /><i /></div>
          <div className="loader-wordmark">
            <span>HSR / 12.9137° N, 77.6423° E</span>
            <h1>Assembling the neighbourhood</h1>
            <p>{progress < 45 ? "Reading local geometry" : progress < 80 ? "Extruding the city surface" : "Calibrating evidence layers"}</p>
            <div><i style={{ width: `${Math.max(8, progress)}%` }} /></div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
