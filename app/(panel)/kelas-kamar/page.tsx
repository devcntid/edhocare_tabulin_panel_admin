import { Halaman, PageHeader } from "@/components/page";
import { MasterBaris, MasterBaru } from "@/components/master-panel";
import { Pager, Table, pageNum, perNum } from "@/components/table";
import { can } from "@/lib/permissions";
import { potong } from "@/lib/services/daftar";
import { daftarMaster } from "@/lib/services/master";
import { getCurrentUser } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [{ faskes: f, kelas }, user] = await Promise.all([daftarMaster(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "kelola_paket");
  const h = potong(kelas, pageNum(sp.page), perNum(sp.per));
  return (
    <Halaman>
      <PageHeader title="Kelas kamar" desc="Kelas kamar beserta tier, setoran minimum per bulan, dan harganya di tiap faskes. Tarif total paket = harga cara persalinan + harga kelas kamar, kecuali paket itu punya tarif sendiri (lihat Tarif paket). Yang belum dipakai pendaftaran bisa dihapus." aksi={bisa && <MasterBaru jenis="kelas" faskes={f} />} />
      <Table head={["Nama", "Tier", "Setoran min./bulan", ...f.map((x) => `Harga ${x.kode}`), "Dipakai", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!kelas.length}>
        {h.rows.map((m) => <MasterBaris key={m.id} jenis="kelas" m={m} faskes={f} bisa={bisa} />)}
      </Table>
      <Pager basis="/kelas-kamar" params={{}} page={h.page} pages={h.pages} total={h.total} per={h.per} />
    </Halaman>
  );
}
