import Link from "next/link";
import { ArrowLeft, LayoutGrid } from "lucide-react";

export function SiteHeader({ back = false }: { back?: boolean }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="UrbanLens Bengaluru home">
        {back ? <ArrowLeft aria-hidden="true" /> : <span className="brand-mark"><LayoutGrid aria-hidden="true" /></span>}
        <span>
          <strong>URBAN</strong>
          <em>LENS</em>
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
