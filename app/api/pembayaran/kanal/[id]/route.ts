import { z } from "zod";
import { ApiError, handler, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(80).optional(),
  deskripsi: z.string().trim().max(500).optional(),
  aktif: z.boolean().optional(),
  jenis: z.enum(["va", "transfer_manual", "tunai"], "Pilih jenis metode.").optional(),
}).refine((v) => Object.keys(v).length > 0, "Tidak ada perubahan.");

export const PATCH = handler<IdCtx>("keuangan", async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = schema.parse(await jsonBody(req));
  const { rowCount } = await pool.query(
    "UPDATE kanal_pembayaran SET nama=COALESCE($2,nama), deskripsi=COALESCE($3,deskripsi), aktif=COALESCE($4,aktif), jenis=COALESCE($5,jenis) WHERE id=$1", [id, b.nama ?? null, b.deskripsi ?? null, b.aktif ?? null, b.jenis ?? null]);
  if (!rowCount) throw new ApiError(404, "TIDAK_DITEMUKAN", "Metode pembayaran tidak ditemukan.");
  await pool.query("SELECT catat_audit($1,'ubah','kanal_pembayaran',$2,NULL,$3)", [user.id, id, JSON.stringify(b)]);
  return { ok: true };
});
