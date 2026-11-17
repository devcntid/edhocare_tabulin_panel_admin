import { HalamanDaftar } from "@/components/halaman-daftar";
import { one, pageNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { daftarAudit } from "@/lib/services/laporan";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const user = await getCurrentUser();
  const data = await daftarAudit({ q, page: pageNum(sp.page) });
  return (
    <HalamanDaftar ekspor={user && can(user.peran, "kelola_pengguna") ? "audit" : undefined}
      judul="Audit log" desc="Catatan semua aksi admin. Baris audit tidak pernah diubah atau dihapus."
      basis="/audit" cari="Cari aksi, entitas, admin" params={{ q }} data={data} kunci={(l) => l.id}
      kolom={[
        { judul: "Waktu", sel: (l) => <span className="whitespace-nowrap">{fmtTgl(l.dibuat_pada)}</span> },
        { judul: "Admin", sel: (l) => l.admin_nama ?? "-" },
        { judul: "Aksi", sel: (l) => l.aksi },
        { judul: "Entitas", sel: (l) => <>{l.entitas}{l.entitas_id != null && ` #${l.entitas_id}`}</> },
        { judul: "Detail", sel: (l) => <div className="max-w-md truncate font-mono text-xs" title={JSON.stringify(l.sesudah)}>{l.sesudah ? JSON.stringify(l.sesudah) : ""}</div> },
      ]}
    />
  );
}
