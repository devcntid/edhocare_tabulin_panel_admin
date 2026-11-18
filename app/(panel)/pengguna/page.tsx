import { redirect } from "next/navigation";
import { StatusAktif } from "@/components/form-dialog";
import { CariInput, FilterBar, Halaman, PageHeader, Pilih } from "@/components/page";
import { Pager, Table, one, pageNum, perNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { can, PERAN_LABEL } from "@/lib/permissions";
import { pool } from "@/lib/db";
import { potong } from "@/lib/services/daftar";
import { getCurrentUser } from "@/lib/session";
import { PenggunaPanel } from "./pengguna-panel";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const peran = one(sp.peran) ?? "";
  const user = await getCurrentUser();
  if (!user || !can(user.peran, "kelola_pengguna")) redirect("/");
  const semua = (await pool.query("SELECT u.id, u.email, u.nama, u.peran, u.aktif, u.dibuat_pada, ((SELECT count(*) FROM audit_log a WHERE a.pengguna_id = u.id) + (SELECT count(*) FROM transaksi t WHERE t.dikonfirmasi_oleh = u.id))::int AS dipakai FROM pengguna_admin u ORDER BY u.id")).rows;
  const rows = semua.filter((u) => (!peran || u.peran === peran) && (!q.trim() || `${u.nama} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  const h = potong(rows, pageNum(sp.page), perNum(sp.per));
  return (
    <Halaman>
      <PageHeader title="Pengguna admin" desc="Akun yang dapat masuk ke panel. Tiga akun awal berasal dari data demo (db:seed); akun lain dibuat di sini. Akun yang pernah mencatat aktivitas tidak bisa dihapus, hanya dinonaktifkan." aksi={<PenggunaPanel mode="baru" />} />
      <FilterBar>
        <CariInput defaultValue={q} placeholder="Cari nama atau email" />
        <Pilih name="peran" defaultValue={peran} semua="Semua peran" opsi={Object.entries(PERAN_LABEL)} />
      </FilterBar>
      <Table head={["Nama", "Email", "Peran", "Status", "Dibuat", "Aksi"]} empty={!rows.length} filtered={!!(q || peran)} resetHref="/pengguna">
        {h.rows.map((u) => (
          <tr key={u.id}>
            <td>{u.nama}</td><td>{u.email}</td><td>{PERAN_LABEL[u.peran as keyof typeof PERAN_LABEL]}</td><td><StatusAktif aktif={u.aktif} /></td><td>{fmtTgl(u.dibuat_pada)}</td>
            <PenggunaPanel mode="baris" id={u.id} nama={u.nama} dipakai={u.dipakai} aktif={u.aktif} diri={u.id === user.id} />
          </tr>
        ))}
      </Table>
      <Pager basis="/pengguna" params={{ q, peran }} page={h.page} pages={h.pages} total={h.total} per={h.per} />
    </Halaman>
  );
}
