import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Arth-AI", description: "Banking that meets you where life happens" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}