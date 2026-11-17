import { ApiError, handler, idParam, type IdCtx } from "@/lib/api";
import { pool } from "@/lib/db";

/** Send a payment reminder for an unpaid bill: "terlambat" template if overdue, "jatuh tempo" otherwise (mock delivery, logged). */
export const POST = handler<IdCtx>("keuangan", async (_req, user, ctx) => {
  const id = await idParam(ctx);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      `SELECT g.id, g.nomor, g.nominal, g.jatuh_tempo, g.status, r.id AS pid, r.nama, r.status_pendaftaran, (g.jatuh_tempo < today_jkt()) AS lewat
       FROM tagihan g JOIN pendaftaran r ON r.id = g.pendaftaran_id WHERE g.id = $1 FOR UPDATE OF r`, [id]);
    const g = rows[0];
    if (!g) throw new ApiError(404, "TIDAK_DITEMUKAN", "Tagihan tidak ditemukan.");
    if (g.status !== "belum_dibayar" || g.status_pendaftaran !== "aktif") throw new ApiError(409, "STATUS_TIDAK_VALID", "Pengingat hanya untuk tagihan yang belum dibayar pada pendaftaran aktif.");
    const kode = g.lewat ? "tagihan_terlambat" : "pengingat_jatuh_tempo";
    await c.query("SELECT kirim_templat($1,$2,jsonb_build_object('nama',$3::text,'nomor_tagihan',$4::text,'nominal_tagihan',fmt_rp($5::bigint),'jatuh_tempo',fmt_tgl($6::date)),$4)", [g.pid, kode, g.nama, g.nomor, g.nominal, g.jatuh_tempo]);
    await c.query("SELECT catat_audit($1,'kirim_pengingat','tagihan',$2,NULL,$3)", [user.id, id, JSON.stringify({ templat: kode })]);
    await c.query("COMMIT");
    return { templat: kode };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
