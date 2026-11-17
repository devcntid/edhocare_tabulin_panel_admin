import Link from "next/link";
import { Badge } from "@/components/badge";
import { HalamanDaftar, type Kolom } from "@/components/halaman-daftar";
import { PengingatButton } from "@/components/pengingat-button";
import { one, pageNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { daftarTagihan } from "@/lib/services/laporan";

type Baris = Awaited<ReturnType<typeof daftarTagihan>>["rows"][number];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const status = one(sp.status) ?? "";
  const data = await daftarTagihan({ q, status, page: pageNum(sp.page) });
  const user = await getCurrentUser();
  const bisa = !!user && can(user.peran, "keuangan");
  const kolom: Kolom<Baris>[] = [
    { judul: "No. tagihan", sel: (g) => g.nomor },
    { judul: "Peserta", sel: (g) => <Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${g.pendaftaran_id}`}>{g.nama}</Link> },
    { judul: "Jenis", sel: (g) => (g.jenis === "dp" ? "DP" : "Bulanan") },
    { judul: "Periode", sel: (g) => g.periode },
    { judul: "Nominal", tipe: "uang", sel: (g) => g.nominal },
    { judul: "Terbit", sel: (g) => fmtTgl(g.terbit_pada) },
    { judul: "Jatuh tempo", sel: (g) => fmtTgl(g.jatuh_tempo) },
    { judul: "Status", sel: (g) => <Badge value={g.status_tampil} /> },
    ...(bisa ? [{ judul: "", sel: (g: Baris) => (g.status_tampil !== "lunas" ? <PengingatButton id={g.id} nomor={g.nomor} lewat={g.status_tampil === "lewat_jatuh_tempo"} /> : null) }] : []),
  ];
  return (
    <HalamanDaftar
      judul="Tagihan" desc="Tagihan DP dan cicilan bulanan peserta. Kirim pengingat untuk tagihan yang belum dibayar."
      basis="/tagihan" cari="Cari no. tagihan, peserta" params={{ q, status }} data={data} kunci={(g) => g.id} kolom={kolom}
      filter={[{ name: "status", semua: "Semua status", opsi: [["belum_dibayar", "Belum dibayar"], ["lewat_jatuh_tempo", "Lewat jatuh tempo"], ["lunas", "Lunas"]] }]}
    />
  );
}
