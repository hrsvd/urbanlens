import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";

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
        <span>HSR Layout only · Geographic cells, never individual properties</span>
        <span>Open evidence · Transparent uncertainty</span>
      </footer>
    </main>
  );
}
