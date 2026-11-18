import { CariInput, FilterBar, Halaman, PageHeader } from "@/components/page";
import { Pager, Table, one, pageNum, perNum } from "@/components/table";
import { can } from "@/lib/permissions";
import { potong } from "@/lib/services/daftar";
import { getCurrentUser } from "@/lib/session";
import { daftarKanal } from "@/lib/services/laporan";
import { KanalBaris, KanalBaru } from "./kanal-panel";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const [{ kanal, instruksi }, user] = await Promise.all([daftarKanal(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "keuangan");
  const tampil = kanal.filter((k) => !q.trim() || `${k.nama} ${k.kode} ${k.deskripsi ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const h = potong(tampil, pageNum(sp.page), perNum(sp.per));
  return (
    <Halaman>
      <PageHeader title="Metode pembayaran" desc="Cara pembayaran yang ditawarkan ke peserta. Virtual account masuk otomatis; transfer bank manual dan tunai dikonfirmasi keuangan. Metode yang disembunyikan tidak muncul di aplikasi; metode yang belum dipakai bisa dihapus. Pembayaran lewat gateway (virtual account Midtrans Sandbox) dibuat per tagihan dari aplikasi peserta dan terkonfirmasi otomatis; Faspay belum tersedia." aksi={bisa && <KanalBaru />} />
      <FilterBar><CariInput defaultValue={q} placeholder="Cari nama, kode, deskripsi" /></FilterBar>
      <Table head={["Metode", "Jenis", "Kode", "Deskripsi", "Instruksi", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!tampil.length} filtered={!!q} resetHref="/pembayaran">
        {h.rows.map((k) => <KanalBaris key={k.id} k={k} jumlahInstruksi={instruksi.filter((i) => i.kanal_id === k.id).length} bisa={bisa} />)}
      </Table>
      <Pager basis="/pembayaran" params={{ q }} page={h.page} pages={h.pages} total={h.total} per={h.per} />
    </Halaman>
  );
}
