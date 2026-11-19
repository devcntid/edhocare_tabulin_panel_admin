import { CariInput, FilterBar, Halaman, PageHeader, Pilih } from "@/components/page";
import { Pager, one, pageNum, perNum } from "@/components/table";
import { can } from "@/lib/permissions";
import { potong } from "@/lib/services/daftar";
import { getCurrentUser } from "@/lib/session";
import { daftarKanal } from "@/lib/services/laporan";
import { KanalBaru, KanalDaftar } from "./kanal-panel";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const kanalId = one(sp.kanal) ?? "";
  const [{ kanal, instruksi }, user] = await Promise.all([daftarKanal(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "keuangan");
  const cari = q.trim().toLowerCase();
  const cocok = (teks: string) => teks.toLowerCase().includes(cari);
  // A method shows when it matches the search itself or through one of its instruksi; it then keeps all of its instruksi.
  const tampil = kanal.filter((k) =>
    (!kanalId || String(k.id) === kanalId) &&
    (!cari || cocok(`${k.nama} ${k.kode} ${k.deskripsi ?? ""}`) || instruksi.some((i) => i.kanal_id === k.id && cocok(`${i.judul} ${i.isi} ${i.nama_bank ?? ""} ${i.nama_rekening ?? ""}`))));
  const h = potong(tampil, pageNum(sp.page), perNum(sp.per));
  const dihalaman = new Set(h.rows.map((k) => k.id));
  return (
    <Halaman>
      <PageHeader title="Metode pembayaran" desc="Cara pembayaran yang ditawarkan ke peserta. Instruksi pembayaran ada di dalam tiap metode dan dikirim ke aplikasi peserta lewat API (GET /api/integrasi/instruksi); jangan menulis kredensial, kunci API, atau konfigurasi internal di instruksi. Seret metode atau instruksi untuk mengatur urutannya. Virtual account masuk otomatis; transfer bank manual dan tunai dikonfirmasi keuangan. Yang disembunyikan tidak muncul di aplikasi; metode yang belum dipakai bisa dihapus. Pembayaran lewat gateway (virtual account Midtrans Sandbox) dibuat per tagihan dari aplikasi peserta dan terkonfirmasi otomatis; Faspay belum tersedia." aksi={bisa && <KanalBaru />} />
      <FilterBar>
        <CariInput defaultValue={q} placeholder="Cari metode, judul, isi, bank, rekening" />
        <Pilih name="kanal" defaultValue={kanalId} semua="Semua metode" opsi={kanal.map((k) => [String(k.id), k.nama] as const)} />
      </FilterBar>
      <KanalDaftar kanal={h.rows} instruksi={instruksi.filter((i) => dihalaman.has(i.kanal_id))} bisa={bisa} filtered={!!(q || kanalId)} />
      <Pager basis="/pembayaran" params={{ q, kanal: kanalId }} page={h.page} pages={h.pages} total={h.total} per={h.per} />
    </Halaman>
  );
}
