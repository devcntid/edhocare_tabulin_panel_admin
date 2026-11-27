import { Halaman, PageHeader } from "@/components/page";
import { TarifBarisRow } from "@/components/tarif-paket-panel";
import { Pager, Table, pageNum, perNum } from "@/components/table";
import { can } from "@/lib/permissions";
import { potong } from "@/lib/services/daftar";
import { daftarMaster, daftarTarifPaket } from "@/lib/services/master";
import { getCurrentUser } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [{ faskes: f }, tarif, user] = await Promise.all([daftarMaster(), daftarTarifPaket(), getCurrentUser()]);
  const bisa = !!user && can(user.peran, "kelola_paket");
  const h = potong(tarif, pageNum(sp.page), perNum(sp.per));
  return (
    <Halaman>
      <PageHeader title="Tarif paket" desc="Tarif total tiap paket (cara persalinan × kelas kamar) di tiap faskes, sebagaimana tampil di aplikasi. Tarif paket (BRD) didahulukan; bila tidak ada, tarif dihitung dari harga cara persalinan + harga kelas kamar. Pendaftaran yang sudah ada menyimpan tarifnya sendiri." />
      <Table head={["Cara persalinan", "Kelas kamar", ...f.map((x) => `Tarif ${x.kode}`), "Sumber", ...(bisa ? ["Aksi"] : [])]} empty={!tarif.length}>
        {h.rows.map((t) => <TarifBarisRow key={`${t.cara_id}-${t.kelas_id}`} t={t} faskes={f} bisa={bisa} />)}
      </Table>
      <Pager basis="/tarif-paket" params={{}} page={h.page} pages={h.pages} total={h.total} per={h.per} />
    </Halaman>
  );
}
