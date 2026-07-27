import type { Metadata, Viewport } from "next";
import { Sora, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

// Distinctive geo-intelligence pairing: Sora for headings/wordmarks, IBM Plex
// Sans for humanist body text, and IBM Plex Mono for tabular score/coordinate
// readouts. All are dark-mode friendly with strong tabular figures.
const display = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "UrbanLens Bengaluru",
    template: "%s · UrbanLens Bengaluru",
  },
  description: "Evidence-led livability signals for 100 m geographic cells across major Bengaluru localities. Transparent data, honest confidence, no scoring of individuals.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#06110f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
