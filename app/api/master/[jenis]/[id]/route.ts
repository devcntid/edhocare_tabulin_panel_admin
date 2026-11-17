import { z } from "zod";
import { ApiError, handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";
import { masterDef, simpanHarga } from "@/lib/services/master";

type Ctx = { params: Promise<{ jenis: string; id: string }> };

const schema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(60).optional(),
  tier: z.enum(["Saving+ Premium", "Saving+ Essential"]).optional(),
  setoran_min_bulanan: z.number().int().positive("Setoran minimum harus lebih dari 0.").optional(),
  aktif: z.boolean().optional(),
  harga: z.record(z.string(), z.number()).optional(),
}).refine((v) => Object.keys(v).length > 0, "Tidak ada perubahan.");

// Renaming also renames the value on existing paket (paket stores the name as text); tier and minimum deposit changes are copied to the paket of that kelas.
export const PATCH = handler<Ctx>("kelola_paket", async (req, user, ctx) => {
  const { jenis, id: idStr } = await ctx.params;
  const d = masterDef(jenis);
  const id = Number(idStr);
  const b = schema.parse(await jsonBody(req));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const lama = (await c.query(`SELECT * FROM ${d.tabel} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!lama) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
    const baru = { nama: b.nama ?? lama.nama, aktif: b.aktif ?? lama.aktif, ...(d.tier ? { tier: b.tier ?? lama.tier, setoran_min_bulanan: b.setoran_min_bulanan ?? lama.setoran_min_bulanan } : {}) };
    const k = baru as { tier: string; setoran_min_bulanan: number };
    if (d.tier) await c.query(`UPDATE ${d.tabel} SET nama=$2, aktif=$3, tier=$4, setoran_min_bulanan=$5 WHERE id=$1`, [id, baru.nama, baru.aktif, k.tier, k.setoran_min_bulanan]);
    else await c.query(`UPDATE ${d.tabel} SET nama=$2, aktif=$3 WHERE id=$1`, [id, baru.nama, baru.aktif]);
    if (baru.nama !== lama.nama || (d.tier && (k.tier !== lama.tier || k.setoran_min_bulanan !== Number(lama.setoran_min_bulanan)))) {
      if (d.tier) await c.query("UPDATE paket SET kelas_kamar=$2, tier=$3, setoran_min_bulanan=$4 WHERE kelas_kamar=$1", [lama.nama, baru.nama, k.tier, k.setoran_min_bulanan]);
      else await c.query("UPDATE paket SET cara_persalinan=$2 WHERE cara_persalinan=$1", [lama.nama, baru.nama]);
    }
    if (b.harga) await simpanHarga(c, d.tier ? "kelas" : "cara", id, b.harga);
    await c.query("SELECT catat_audit($1,'ubah',$2,$3,$4,$5)", [user.id, d.tabel, id, JSON.stringify(lama), JSON.stringify({ ...baru, harga: b.harga })]);
    await c.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
