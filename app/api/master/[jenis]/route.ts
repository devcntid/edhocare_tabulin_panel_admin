import { z } from "zod";
import { ApiError, handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";
import { masterDef, simpanHarga } from "@/lib/services/master";

type Ctx = { params: Promise<{ jenis: string }> };

const schema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(60),
  tier: z.enum(["Saving+ Premium", "Saving+ Essential"], "Pilih tier.").optional(),
  setoran_min_bulanan: z.number("Setoran minimum harus berupa angka.").int().positive("Setoran minimum harus lebih dari 0.").optional(),
  harga: z.record(z.string(), z.number()),
});

export const POST = handler<Ctx>("kelola_paket", async (req, user, ctx) => {
  const d = masterDef((await ctx.params).jenis);
  const b = schema.parse(await jsonBody(req));
  if (d.tier && !b.tier) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { tier: "Pilih tier." });
  if (d.tier && !b.setoran_min_bulanan) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { setoran_min_bulanan: "Isi setoran minimum per bulan." });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = d.tier
      ? await c.query(`INSERT INTO ${d.tabel} (nama, tier, setoran_min_bulanan) VALUES ($1,$2,$3) RETURNING id`, [b.nama, b.tier, b.setoran_min_bulanan])
      : await c.query(`INSERT INTO ${d.tabel} (nama) VALUES ($1) RETURNING id`, [b.nama]);
    await simpanHarga(c, d.tier ? "kelas" : "cara", rows[0].id, b.harga);
    await c.query("SELECT catat_audit($1,'buat',$2,$3,NULL,$4)", [user.id, d.tabel, rows[0].id, JSON.stringify(b)]);
    await c.query("COMMIT");
    return { id: rows[0].id as number };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }

});
