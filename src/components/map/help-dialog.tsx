"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MousePointer2, Rotate3D, Search, X, ZoomIn } from "lucide-react";

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={onClose} aria-label="Close instructions"><X /></button>
            <span className="eyebrow">Explore in three dimensions</span>
            <h2 id="help-title">Read HSR as a living surface.</h2>
            <div className="help-grid">
              <div><MousePointer2 /><strong>Select a cell</strong><p>Click anywhere inside HSR to open evidence for that 100 m square.</p></div>
              <div><Rotate3D /><strong>Orbit and tilt</strong><p>Right-drag or Ctrl-drag to rotate. Two-finger drag changes pitch on touch.</p></div>
              <div><ZoomIn /><strong>Move through scale</strong><p>Scroll or pinch to zoom; drag to pan across the suspended city.</p></div>
              <div><Search /><strong>Find a place</strong><p>Search the local HSR index, then fly to the surrounding analysis cell.</p></div>
            </div>
            <footer>This tool describes geographic cells. It never certifies an apartment, street, building, or resident.</footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
