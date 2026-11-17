import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Edelweiss brand typeface (Source Sans Pro, now published as Source Sans 3). Self-hosted at build time by next/font.
const fontMerek = Source_Sans_3({ subsets: ["latin"], weight: ["300", "400", "600", "700"], display: "swap", variable: "--font-merek" });

export const metadata: Metadata = { title: "Tabulin Admin", description: "Panel admin Tabungan Ibu Bersalin" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={fontMerek.variable}>
      <body>{children}</body>
    </html>
  );
}
