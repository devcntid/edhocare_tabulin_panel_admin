import { CariInput, FilterBar, Halaman, PageHeader } from "@/components/page";
import { Table, one } from "@/components/table";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { daftarKanal } from "@/lib/services/laporan";
import { KanalBaris, KanalBaru } from "./kanal-panel";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const [{ kanal, instruksi }, user] = await Promise.all([daftarKanal(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "keuangan");
  const tampil = kanal.filter((k) => !q.trim() || `${k.nama} ${k.kode} ${k.deskripsi ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Halaman>
      <PageHeader title="Metode pembayaran" desc="Cara pembayaran yang ditawarkan ke peserta. Metode yang disembunyikan tidak muncul di aplikasi; metode yang belum punya instruksi bisa dihapus. Belum ada integrasi payment gateway." aksi={bisa && <KanalBaru />} />
      <FilterBar><CariInput defaultValue={q} placeholder="Cari nama, kode, deskripsi" /></FilterBar>
      <Table head={["Metode", "Kode", "Deskripsi", "Instruksi", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!tampil.length} filtered={!!q} resetHref="/pembayaran">
        {tampil.map((k) => <KanalBaris key={k.id} k={k} jumlahInstruksi={instruksi.filter((i) => i.kanal_id === k.id).length} bisa={bisa} />)}
      </Table>
    </Halaman>
  );
}
