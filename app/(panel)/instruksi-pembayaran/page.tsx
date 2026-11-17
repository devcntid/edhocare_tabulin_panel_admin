import { CariInput, FilterBar, Halaman, PageHeader, Pilih } from "@/components/page";
import { Table, one } from "@/components/table";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { daftarKanal } from "@/lib/services/laporan";
import { InstruksiBaris, InstruksiBaru } from "../pembayaran/kanal-panel";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const kanalId = one(sp.kanal) ?? "";
  const [{ kanal, instruksi }, user] = await Promise.all([daftarKanal(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "keuangan");
  const namaKanal = new Map(kanal.map((k) => [k.id, k.nama]));
  const tampil = instruksi.filter((i) =>
    (!kanalId || String(i.kanal_id) === kanalId) && (!q.trim() || `${i.judul} ${i.isi} ${i.nama_bank ?? ""} ${i.nama_rekening ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Halaman>
      <PageHeader
        title="Instruksi pembayaran"
        desc={<>Instruksi aktif dikirim ke aplikasi peserta lewat API (<code>GET /api/integrasi/instruksi</code>). Jangan menulis kredensial, kunci API, atau konfigurasi internal di instruksi.</>}
        aksi={bisa && <InstruksiBaru kanal={kanal.map((k) => ({ id: k.id, nama: k.nama }))} />}
      />
      <FilterBar>
        <CariInput defaultValue={q} placeholder="Cari judul, isi, bank, rekening" />
        <Pilih name="kanal" defaultValue={kanalId} semua="Semua metode" opsi={kanal.map((k) => [String(k.id), k.nama] as const)} />
      </FilterBar>
      <Table head={["Metode", "Judul", "Isi", "Bank · Rekening", "No. rekening", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!tampil.length} filtered={!!(q || kanalId)} resetHref="/instruksi-pembayaran">
        {tampil.map((i) => <InstruksiBaris key={i.id} i={i} kanal={namaKanal.get(i.kanal_id) ?? "-"} bisa={bisa} />)}
      </Table>
    </Halaman>
  );
}
