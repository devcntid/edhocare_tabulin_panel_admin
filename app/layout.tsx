import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Tabulin Admin", description: "Panel admin Tabungan Ibu Bersalin" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
