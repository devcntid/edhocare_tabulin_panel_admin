import { Halaman, PageHeader } from "@/components/page";
import { MasterBaris, MasterBaru } from "@/components/master-panel";
import { Table } from "@/components/table";
import { can } from "@/lib/permissions";
import { daftarMaster } from "@/lib/services/master";
import { getCurrentUser } from "@/lib/session";

export default async function Page() {
  const [{ faskes: f, kelas }, user] = await Promise.all([daftarMaster(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "kelola_paket");
  return (
    <Halaman>
      <PageHeader title="Kelas kamar" desc="Kelas kamar beserta tier, setoran minimum per bulan, dan harganya di tiap faskes. Total harga pendaftaran = harga cara persalinan + harga kelas kamar. Yang belum dipakai pendaftaran bisa dihapus." aksi={bisa && <MasterBaru jenis="kelas" faskes={f} />} />
      <Table head={["Nama", "Tier", "Setoran min./bulan", ...f.map((x) => `Harga ${x.kode}`), "Dipakai", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!kelas.length}>
        {kelas.map((m) => <MasterBaris key={m.id} jenis="kelas" m={m} faskes={f} bisa={bisa} />)}
      </Table>
    </Halaman>
  );
}
