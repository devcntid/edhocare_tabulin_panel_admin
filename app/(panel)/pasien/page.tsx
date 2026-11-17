import Link from "next/link";
import { Badge } from "@/components/badge";
import { HalamanDaftar } from "@/components/halaman-daftar";
import { one, pageNum } from "@/components/table";
import { daftarPasien } from "@/lib/services/laporan";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const data = await daftarPasien({ q, page: pageNum(sp.page) });
  return (
    <HalamanDaftar ekspor="pasien"
      judul="Pasien" desc="Data pasien berasal dari aplikasi/API dan tidak dapat diubah di panel. Pasien dikelompokkan menurut No. RM."
      basis="/pasien" cari="Cari nama, No. RM, No. HP" params={{ q }} data={data} kunci={(p) => p.no_rm}
      kolom={[
        { judul: "No. RM", sel: (p) => <Link className="font-semibold text-[var(--primary)]" href={`/pasien/${encodeURIComponent(p.no_rm)}`}>{p.no_rm}</Link> },
        { judul: "Nama", sel: (p) => p.nama },
        { judul: "No. HP", sel: (p) => p.no_hp },
        { judul: "Pendaftaran", tipe: "angka", sel: (p) => p.jumlah },
        { judul: "Status terakhir", sel: (p) => (p.status_terakhir ? <Badge value={p.status_terakhir} /> : <span className="text-[#888]">Belum mendaftar</span>) },
        { judul: "Total saldo", tipe: "uang", sel: (p) => p.total_saldo },
      ]}
    />
  );
}
