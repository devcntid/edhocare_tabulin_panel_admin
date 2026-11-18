import Link from "next/link";
import { Badge, label } from "@/components/badge";
import { HalamanDaftar } from "@/components/halaman-daftar";
import { TombolDetail } from "@/components/page";
import { one, pageNum, perNum } from "@/components/table";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { fmtTgl } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { STATUS, daftar } from "@/lib/services/pendaftaran";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const status = one(sp.status) ?? "";
  const user = await getCurrentUser();
  const data = await daftar({ q, status, page: pageNum(sp.page), per: perNum(sp.per) });
  return (
    <HalamanDaftar ekspor="pendaftaran"
      judul="Pendaftaran"
      desc="Pendaftaran program Tabulin dari aplikasi atau petugas. Verifikasi, pasang VA, dan terbitkan tagihan dari halaman detail."
      aksi={user && can(user.peran, "verifikasi") && <><Link href="/pendaftaran/impor" className={btnSecondary}>Impor CSV</Link><Link href="/pendaftaran/baru" className={btnPrimary}>+ Pendaftaran baru</Link></>}
      basis="/pendaftaran" cari="Cari nama, no., No. RM, No. HP" params={{ q, status }} data={data} kunci={(p) => p.id}
      filter={[{ name: "status", semua: "Semua status", opsi: STATUS.map((s) => [s, label(s)] as const) }]}
      kolom={[
        { judul: "No.", sel: (p) => <Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${p.id}`}>{p.nomor}</Link> },
        { judul: "Nama", sel: (p) => p.nama },
        { judul: "No. RM", sel: (p) => p.no_rm },
        { judul: "Faskes", sel: (p) => p.faskes },
        { judul: "Kamar · Persalinan", sel: (p) => `${p.kelas_kamar} · ${p.cara_persalinan}` },
        { judul: "Saldo", tipe: "uang", sel: (p) => p.saldo },
        { judul: "Status", sel: (p) => <Badge value={p.status_pendaftaran} /> },
        { judul: "Terkirim", sel: (p) => fmtTgl(p.dibuat_pada) },
        { judul: "Aksi", tipe: "aksi", sel: (p) => <TombolDetail href={`/pendaftaran/${p.id}`} /> },
      ]}
    />
  );
}
