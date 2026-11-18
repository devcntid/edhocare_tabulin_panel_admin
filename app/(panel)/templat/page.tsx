import { label } from "@/components/badge";
import { CariInput, FilterBar, Halaman, PageHeader, Pilih } from "@/components/page";
import { Pager, Table, one, pageNum, perNum } from "@/components/table";
import { can } from "@/lib/permissions";
import { potong } from "@/lib/services/daftar";
import { getCurrentUser } from "@/lib/session";
import { FILTER, daftarTemplat } from "@/lib/services/laporan";
import { TemplatBaris } from "./templat-baris";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qMentah = one(sp.q) ?? "";
  const q = qMentah.trim().toLowerCase();
  const kategori = one(sp.kategori) ?? "";
  const [semua, user] = await Promise.all([daftarTemplat(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "verifikasi");
  const templat = semua.filter((t) => (!kategori || t.kategori === kategori) && (!q || `${t.nama} ${t.judul} ${t.isi} ${t.kode}`.toLowerCase().includes(q)));
  const h = potong(templat, pageNum(sp.page), perNum(sp.per));
  return (
    <Halaman>
      <PageHeader
        title="Templat notifikasi"
        desc={<>Teks pesan ke peserta. Tulis variabel dengan <code>{"{{nama}}"}</code>; hanya variabel yang tersedia pada tiap templat yang boleh dipakai. Perubahan berlaku untuk notifikasi berikutnya, notifikasi lama tidak berubah. Templat nonaktif tidak mengirim pesan.</>}
      />
      <FilterBar>
        <CariInput defaultValue={qMentah} placeholder="Cari nama, judul, isi" />
        <Pilih name="kategori" defaultValue={kategori} semua="Semua kategori" opsi={FILTER.kategoriNotifikasi.map((k) => [k, label(k)] as const)} />
      </FilterBar>
      <Table head={["Templat", "Kategori", "Judul", "Isi pesan", "Variabel", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!templat.length} filtered={!!(qMentah || kategori)} resetHref="/templat">
        {h.rows.map((t) => <TemplatBaris key={t.kode} t={{ ...t, kategoriLabel: label(t.kategori) }} bisa={bisa} kategori={FILTER.kategoriNotifikasi.map((k) => [k, label(k)] as const)} />)}
      </Table>
      <Pager basis="/templat" params={{ q: qMentah, kategori }} page={h.page} pages={h.pages} total={h.total} per={h.per} />
    </Halaman>
  );
}
