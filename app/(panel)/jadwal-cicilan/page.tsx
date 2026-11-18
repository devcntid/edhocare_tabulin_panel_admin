import Link from "next/link";
import { Badge, label } from "@/components/badge";
import { HalamanDaftar } from "@/components/halaman-daftar";
import { TombolDetail } from "@/components/page";
import { one, pageNum, perNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { FILTER, daftarJadwal } from "@/lib/services/laporan";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const status = one(sp.status) ?? "";
  const data = await daftarJadwal({ q, status, page: pageNum(sp.page), per: perNum(sp.per) });
  return (
    <HalamanDaftar ekspor="jadwal-cicilan"
      judul="Jadwal cicilan"
      desc="Seluruh termin cicilan peserta menurut tanggal jatuh tempo. Jadwal dibuat otomatis saat tagihan DP terbit; tagihan tiap termin diterbitkan dari halaman detail pendaftaran."
      basis="/jadwal-cicilan" cari="Cari peserta, no. pendaftaran, no. tagihan" params={{ q, status }} data={data} kunci={(j) => j.id}
      filter={[{ name: "status", semua: "Semua status", opsi: FILTER.statusJadwal.map((s) => [s, label(s)] as const) }]}
      kolom={[
        { judul: "Peserta", sel: (j) => <><Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${j.pendaftaran_id}`}>{j.nama}</Link><div className="text-xs text-[#888]">{j.nomor}</div></> },
        { judul: "Termin", sel: (j) => `${j.urutan} dari ${j.jumlah_cicilan}` },
        { judul: "Periode", sel: (j) => j.periode },
        { judul: "Jatuh tempo", sel: (j) => fmtTgl(j.jatuh_tempo) },
        { judul: "Nominal", tipe: "uang", sel: (j) => j.nominal },
        { judul: "Status", sel: (j) => <Badge value={j.status_tampil} /> },
        { judul: "No. tagihan", sel: (j) => j.nomor_tagihan ?? "-" },
        { judul: "Aksi", tipe: "aksi", sel: (j) => <TombolDetail href={`/pendaftaran/${j.pendaftaran_id}`} /> },
      ]}
    />
  );
}
