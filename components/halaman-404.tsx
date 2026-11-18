import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/components/ui";

/** Shared "not found" card, used by the root 404 (unknown URL) and the panel 404 (notFound() from a page). */
export function Halaman404({ judul = "Halaman tidak ditemukan", desc = "Alamat yang Anda buka tidak ada atau datanya sudah dihapus." }: { judul?: string; desc?: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-[#e1eaf2] bg-white p-8 text-center">
      <p className="text-5xl font-bold tabular-nums text-[var(--primary)]" aria-hidden="true">404</p>
      <h1 className="text-lg font-bold">{judul}</h1>
      <p className="text-[13px] text-[#666]">{desc}</p>
      <div className="flex justify-center gap-2">
        <Link href="/" className={btnPrimary}>Kembali ke dasbor</Link>
        <Link href="/pendaftaran" className={btnSecondary}>Lihat pendaftaran</Link>
      </div>
    </div>
  );
}
