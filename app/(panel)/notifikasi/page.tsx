import Link from "next/link";
import { label } from "@/components/badge";
import { HalamanDaftar } from "@/components/halaman-daftar";
import { one, pageNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { FILTER, daftarNotifikasi } from "@/lib/services/laporan";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const kategori = one(sp.kategori) ?? "";
  const data = await daftarNotifikasi({ q, kategori, page: pageNum(sp.page) });
  return (
    <HalamanDaftar ekspor="notifikasi"
      judul="Notifikasi ke peserta"
      desc={<>Log notifikasi dari aksi admin dan sistem. Teks dirender dari templat dan disimpan sebagai salinan. Versi lokal memakai pengiriman tiruan: status &quot;tercatat&quot; berarti hanya dicatat, belum dikirim lewat push/WhatsApp.</>}
      basis="/notifikasi" cari="Cari judul, peserta, templat" params={{ q, kategori }} data={data} kunci={(n) => n.id}
      filter={[{ name: "kategori", semua: "Semua kategori", opsi: FILTER.kategoriNotifikasi.map((k) => [k, label(k)] as const) }]}
      kolom={[
        { judul: "Waktu", sel: (n) => <span className="whitespace-nowrap">{fmtTgl(n.dibuat_pada)}</span> },
        { judul: "Peserta", sel: (n) => <Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${n.pendaftaran_id}`}>{n.nama}</Link> },
        { judul: "Kategori", sel: (n) => label(n.kategori) },
        { judul: "Templat", sel: (n) => <span className="text-xs text-[#666]">{n.templat_kode ?? "-"}</span> },
        { judul: "Kanal", sel: (n) => n.kanal },
        { judul: "Status kirim", sel: (n) => <>{n.status_kirim}{n.galat && <div className="text-xs text-red-600">{n.galat}</div>}</> },
        { judul: "Pesan", sel: (n) => <><div className="font-semibold">{n.judul}</div><div className="text-[#555]">{n.isi}</div></> },
      ]}
    />
  );
}
