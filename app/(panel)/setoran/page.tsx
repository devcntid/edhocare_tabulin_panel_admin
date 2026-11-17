import Link from "next/link";
import { HalamanDaftar } from "@/components/halaman-daftar";
import { one, pageNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { FILTER, daftarTransaksi } from "@/lib/services/laporan";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const jenis = one(sp.jenis) ?? "";
  const data = await daftarTransaksi({ q, jenis, page: pageNum(sp.page) });
  return (
    <HalamanDaftar ekspor="setoran"
      judul="Setoran (buku besar)"
      desc="Setoran diterima dari API (bank/aplikasi) secara otomatis; admin hanya dapat mengoreksi dari halaman detail pendaftaran. Baris buku besar tidak pernah diubah; koreksi dicatat sebagai baris negatif."
      basis="/setoran" cari="Cari no. transaksi, peserta" params={{ q, jenis }} data={data} kunci={(t) => t.id}
      filter={[{ name: "jenis", semua: "Semua jenis", opsi: FILTER.jenisTransaksi.map((j) => [j, j] as const) }]}
      kolom={[
        { judul: "No. transaksi", sel: (t) => t.nomor },
        { judul: "Peserta", sel: (t) => <Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${t.pendaftaran_id}`}>{t.nama}</Link> },
        { judul: "Jenis", sel: (t) => t.jenis },
        { judul: "Tgl bayar", sel: (t) => fmtTgl(t.tanggal_bayar) },
        { judul: "Nominal", tipe: "uang", sel: (t) => t.nominal_transaksi },
        { judul: "Saldo setelah", tipe: "uang", sel: (t) => t.saldo_setelah },
        { judul: "Dikonfirmasi", sel: (t) => fmtTgl(t.tanggal_konfirmasi) },
      ]}
    />
  );
}
