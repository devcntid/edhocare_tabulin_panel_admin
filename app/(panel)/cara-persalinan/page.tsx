import { Halaman, PageHeader } from "@/components/page";
import { MasterBaris, MasterBaru } from "@/components/master-panel";
import { Pager, Table, pageNum, perNum } from "@/components/table";
import { can } from "@/lib/permissions";
import { potong } from "@/lib/services/daftar";
import { daftarMaster } from "@/lib/services/master";
import { getCurrentUser } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [{ faskes: f, cara }, user] = await Promise.all([daftarMaster(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "kelola_paket");
  const h = potong(cara, pageNum(sp.page), perNum(sp.per));
  return (
    <Halaman>
      <PageHeader title="Cara persalinan" desc="Pilihan cara persalinan beserta harganya di tiap faskes. Total harga pendaftaran = harga cara persalinan + harga kelas kamar. Sembunyikan untuk menghilangkan dari pilihan; yang belum dipakai pendaftaran bisa dihapus." aksi={bisa && <MasterBaru jenis="cara" faskes={f} />} />
      <Table head={["Nama", ...f.map((x) => `Harga ${x.kode}`), "Dipakai", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!cara.length}>
        {h.rows.map((m) => <MasterBaris key={m.id} jenis="cara" m={m} faskes={f} bisa={bisa} />)}
      </Table>
      <Pager basis="/cara-persalinan" params={{}} page={h.page} pages={h.pages} total={h.total} per={h.per} />
    </Halaman>
  );
}
