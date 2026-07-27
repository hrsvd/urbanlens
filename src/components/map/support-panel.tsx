"use client";

import { Github, Heart, Linkedin, QrCode, Star, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { SOCIAL } from "@/lib/social-config";
import { useEffect, useState } from "react";

function UpiQrSlot() {
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(SOCIAL.upiQrImagePath, { method: "HEAD" })
      .then((r) => setExists(r.ok))
      .catch(() => setExists(false));
  }, []);

  if (exists === null) return null;

  if (!exists) {
    return (
      <div className="support-qr-placeholder">
        <QrCode aria-hidden="true" />
        <span>QR coming soon</span>
      </div>
    );
  }

  return (
    <div className="support-qr">
      <img src={SOCIAL.upiQrImagePath} alt="UPI payment QR code" width={140} height={140} />
      <span>Scan to support via UPI</span>
    </div>
  );
}

export function SupportPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="support-backdrop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            className="support-panel"
            role="dialog"
            aria-label="Support the project"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
          >
            <header className="support-header">
              <span>Support UrbanLens</span>
              <button type="button" onClick={onClose} aria-label="Close support panel">
                <X aria-hidden="true" />
              </button>
            </header>

            <p className="support-intro">
              UrbanLens is a free, open-source project. If it helps you, here are ways to show it.
            </p>

            <div className="support-actions">
              <a
                href={SOCIAL.githubProject}
                target="_blank"
                rel="noreferrer"
                className="support-action primary"
                aria-label="Star UrbanLens on GitHub"
              >
                <Star aria-hidden="true" />
                <div>
                  <strong>Star on GitHub</strong>
                  <span>github.com/hrsvd/urbanlens</span>
                </div>
              </a>

              <a
                href={SOCIAL.linkedin}
                target="_blank"
                rel="noreferrer"
                className="support-action"
                aria-label="Connect on LinkedIn"
              >
                <Linkedin aria-hidden="true" />
                <div>
                  <strong>Connect on LinkedIn</strong>
                  <span>Say hello or share feedback</span>
                </div>
              </a>
            </div>

            <div className="support-upi">
              <UpiQrSlot />
            </div>

            <footer className="support-footer">
              <Heart aria-hidden="true" />
              <span>Made with care by&nbsp;
                <a href={SOCIAL.githubProfile} target="_blank" rel="noreferrer">Harsh</a>
              </span>
              <a href={SOCIAL.githubProject} target="_blank" rel="noreferrer">
                <Github aria-hidden="true" />
              </a>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
