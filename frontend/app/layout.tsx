import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font instead of a CSS @import from
// fonts.googleapis.com: the font files are fetched once at build time and
// served from the same origin as the app, so there's no extra render-blocking
// round trip to Google's servers on every page load (and no layout shift
// while that request is in flight) — a real, measurable first-load win on
// top of just looking the same.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MISP Bank",
  description: "Banking that meets you where life happens",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={plexSans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
