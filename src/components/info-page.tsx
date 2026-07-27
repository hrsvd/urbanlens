"use client";

import { useState, type ReactNode } from "react";
import { Heart } from "lucide-react";
import { SiteHeader } from "./site-header";
import { SupportPanel } from "./map/support-panel";
import { SOCIAL } from "@/lib/social-config";

export function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <main className="info-shell">
      <SiteHeader back />
      <article className="info-article">
        <header className="info-hero">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{intro}</p>
        </header>
        <div className="info-content">{children}</div>
      </article>
      <footer className="info-footer">
        <span>8 Bengaluru localities · Geographic cells, never individual properties</span>
        <span>Open evidence · Transparent uncertainty</span>
        <div className="info-footer-credit">
          <a
            href={SOCIAL.githubProfile}
            target="_blank"
            rel="noreferrer"
            className="credit-link"
          >
            <Heart aria-hidden="true" />
            Made with care by Harsh
          </a>
          <button
            type="button"
            className="support-trigger"
            onClick={() => setSupportOpen(true)}
          >
            Support
          </button>
        </div>
      </footer>
      <SupportPanel open={supportOpen} onClose={() => setSupportOpen(false)} />
    </main>
  );
}
