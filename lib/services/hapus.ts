import { ApiError } from "@/lib/api";
import { pool } from "@/lib/db";
import { can, type Aksi, type Peran } from "@/lib/permissions";

type Def = { aksi: Aksi; nama: string; teks: boolean; pakai: string; ambil: string; hapus: string; sebelum?: string };

// A record can be deleted only while nothing refers to it. Otherwise the admin hides / deactivates it, so history stays intact.
export const HAPUS: Record<string, Def> = {
  pengguna: {
    aksi: "kelola_pengguna", nama: "Pengguna", teks: false,
    pakai: "SELECT ((SELECT count(*) FROM audit_log WHERE pengguna_id = $1) + (SELECT count(*) FROM transaksi WHERE dikonfirmasi_oleh = $1))::int",
    ambil: "SELECT to_jsonb(t) - 'password_hash' FROM pengguna_admin t WHERE id = $1", hapus: "DELETE FROM pengguna_admin WHERE id = $1",
  },
  templat: {
    aksi: "verifikasi", nama: "Templat", teks: true,
    pakai: "SELECT count(*)::int FROM notifikasi WHERE templat_kode = $1",
    ambil: "SELECT to_jsonb(t) FROM templat_notifikasi t WHERE kode = $1", hapus: "DELETE FROM templat_notifikasi WHERE kode = $1",
  },
  kanal: {
    aksi: "keuangan", nama: "Metode pembayaran", teks: false,
    pakai: "SELECT (SELECT count(*) FROM instruksi_pembayaran WHERE kanal_id = $1) + (SELECT count(*) FROM transaksi WHERE kanal_id = $1)",
    sebelum: "DELETE FROM kanal_logo WHERE kanal_id = $1",
    ambil: "SELECT to_jsonb(t) FROM kanal_pembayaran t WHERE id = $1", hapus: "DELETE FROM kanal_pembayaran WHERE id = $1",
  },
  instruksi: {
    aksi: "keuangan", nama: "Instruksi", teks: false,
    pakai: "SELECT 0 * $1::bigint",
    ambil: "SELECT to_jsonb(t) FROM instruksi_pembayaran t WHERE id = $1", hapus: "DELETE FROM instruksi_pembayaran WHERE id = $1",
  },
  faskes: {
    aksi: "kelola_paket", nama: "Faskes", teks: false,
    pakai: "SELECT count(*)::int FROM pendaftaran WHERE faskes_id = $1",
    sebelum: "WITH a AS (DELETE FROM harga_cara WHERE faskes_id = $1) DELETE FROM harga_kelas WHERE faskes_id = $1",
    ambil: "SELECT to_jsonb(t) FROM faskes t WHERE id = $1", hapus: "DELETE FROM faskes WHERE id = $1",
  },
  cara: {
    aksi: "kelola_paket", nama: "Cara persalinan", teks: false,
    pakai: "SELECT count(*)::int FROM pendaftaran d JOIN paket p ON p.id = d.paket_id JOIN opsi_cara_persalinan o ON o.nama = p.cara_persalinan WHERE o.id = $1",
    sebelum: "DELETE FROM paket p USING opsi_cara_persalinan o WHERE o.id = $1 AND p.cara_persalinan = o.nama",
    ambil: "SELECT to_jsonb(t) FROM opsi_cara_persalinan t WHERE id = $1", hapus: "DELETE FROM opsi_cara_persalinan WHERE id = $1",
  },
  kelas: {
    aksi: "kelola_paket", nama: "Kelas kamar", teks: false,
    pakai: "SELECT count(*)::int FROM pendaftaran d JOIN paket p ON p.id = d.paket_id JOIN opsi_kelas_kamar o ON o.nama = p.kelas_kamar WHERE o.id = $1",
    sebelum: "DELETE FROM paket p USING opsi_kelas_kamar o WHERE o.id = $1 AND p.kelas_kamar = o.nama",
    ambil: "SELECT to_jsonb(t) FROM opsi_kelas_kamar t WHERE id = $1", hapus: "DELETE FROM opsi_kelas_kamar WHERE id = $1",
  },
};

export async function hapusData(entitas: string, ref: string, peran: Peran, adminId: number) {
  const d = HAPUS[entitas];
  if (!d) throw new ApiError(404, "TIDAK_DITEMUKAN", "Jenis data tidak dikenal.");
  if (!can(peran, d.aksi)) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
  const param = d.teks ? ref : Number(ref);
  if (!d.teks && !Number.isSafeInteger(param)) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  if (entitas === "pengguna" && param === adminId) throw new ApiError(409, "DILARANG", "Anda tidak dapat menghapus akun sendiri.");

  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const snap = (await c.query(`SELECT (${d.ambil}) AS s`, [param])).rows[0].s;
    if (!snap) throw new ApiError(404, "TIDAK_DITEMUKAN", `${d.nama} tidak ditemukan.`);
    const dipakai = Number((await c.query(`SELECT (${d.pakai}) AS n`, [param])).rows[0].n);
    if (dipakai > 0) throw new ApiError(409, "TERPAKAI", `${d.nama} ini sudah dipakai (${dipakai} data terkait) dan tidak bisa dihapus. Sembunyikan atau nonaktifkan saja.`);
    if (d.sebelum) await c.query(d.sebelum, [param]);
    await c.query(d.hapus, [param]);
    await c.query("SELECT catat_audit($1,'hapus',$2,NULL,$3,NULL)", [adminId, entitas, JSON.stringify(snap)]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
