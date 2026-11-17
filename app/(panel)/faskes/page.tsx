import { CariInput, FilterBar, Halaman, PageHeader } from "@/components/page";
import { Table, one } from "@/components/table";
import { pool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { FaskesBaris, FaskesBaru, type F } from "./faskes-panel";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const [{ rows }, user] = await Promise.all([
    pool.query(`SELECT f.id, f.kode, f.nama, f.alamat, f.no_telepon, f.email, f.aktif, (SELECT count(*)::int FROM pendaftaran d WHERE d.faskes_id = f.id) AS dipakai FROM faskes f ORDER BY f.id`),
    getCurrentUser(),
  ]);
  const bisa = !!user && can(user.peran, "kelola_paket");
  const tampil = (rows as F[]).filter((f) => !q.trim() || `${f.kode} ${f.nama} ${f.alamat ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Halaman>
      <PageHeader title="Faskes" desc="Fasilitas kesehatan (cabang RS) yang dipilih di pendaftaran dan punya harga sendiri. Yang disembunyikan tidak muncul di pilihan; yang belum dipakai pendaftaran bisa dihapus." aksi={bisa && <FaskesBaru />} />
      <FilterBar><CariInput defaultValue={q} placeholder="Cari kode, nama, alamat" /></FilterBar>
      <Table head={["Kode", "Nama", "Alamat", "No. telepon", "Email", "Dipakai", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!tampil.length} filtered={!!q} resetHref="/faskes">
        {tampil.map((f) => <FaskesBaris key={f.id} f={f} bisa={bisa} />)}
      </Table>
    </Halaman>
  );
}
