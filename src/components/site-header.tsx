import Link from "next/link";
import { ArrowLeft, Box } from "lucide-react";

export function SiteHeader({ back = false }: { back?: boolean }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="HSR Intelligence Map home">
        {back ? <ArrowLeft aria-hidden="true" /> : <span className="brand-mark"><Box aria-hidden="true" /></span>}
        <span>
          <strong>HSR</strong>
          <em>INTELLIGENCE MAP</em>
        </span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/methodology">Methodology</Link>
        <Link href="/data-sources">Data</Link>
        <Link href="/about">About</Link>
      </nav>
    </header>
  );
}
