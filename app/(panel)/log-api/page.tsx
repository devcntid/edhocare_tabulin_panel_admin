import { HalamanDaftar } from "@/components/halaman-daftar";
import { one, pageNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { FILTER, daftarLogApi } from "@/lib/services/laporan";

const TONE: Record<string, string> = { diterima: "bg-emerald-100 text-emerald-800", duplikat: "bg-sky-100 text-sky-800", ditolak: "bg-red-100 text-red-800" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const hasil = one(sp.hasil) ?? "";
  const data = await daftarLogApi({ q, hasil, page: pageNum(sp.page) });
  return (
    <HalamanDaftar ekspor="log-api"
      judul="Log setoran API"
      desc="Setiap laporan setoran dari bank/aplikasi dicatat di sini, termasuk yang ditolak. Duplikat (referensi sama) tidak dicatat dua kali di buku besar."
      basis="/log-api" cari="Cari no. VA, referensi, no. transaksi" params={{ q, hasil }} data={data} kunci={(l) => l.id}
      filter={[{ name: "hasil", semua: "Semua hasil", opsi: FILTER.hasilApi.map((h) => [h, h] as const) }]}
      kolom={[
        { judul: "Waktu", sel: (l) => <span className="whitespace-nowrap">{fmtTgl(l.diterima_pada)}</span> },
        { judul: "No. VA", sel: (l) => l.no_va ?? "-" },
        { judul: "Referensi", sel: (l) => l.referensi ?? "-" },
        { judul: "Tgl bayar", sel: (l) => (l.tanggal_bayar && /^\d{4}-\d{2}-\d{2}$/.test(l.tanggal_bayar) ? fmtTgl(l.tanggal_bayar) : l.tanggal_bayar ?? "-") },
        { judul: "Nominal", tipe: "uang", sel: (l) => l.nominal },
        { judul: "Hasil", sel: (l) => <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[l.hasil]}`}>{l.hasil}</span> },
        { judul: "Keterangan", sel: (l) => l.nomor_transaksi ?? (l.kode_galat ? `${l.kode_galat}: ${l.pesan ?? ""}` : "") },
      ]}
    />
  );
}
