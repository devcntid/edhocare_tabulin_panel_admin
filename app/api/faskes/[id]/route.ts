import { z } from "zod";
import { ApiError, handler, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(120).optional(),
  alamat: z.string().trim().max(300).optional(),
  no_telepon: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.email("Format email tidak valid.")]).optional(),
  aktif: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "Tidak ada perubahan.");

// The kode is fixed once created: patients' registrations and the app API refer to it.
export const PATCH = handler<IdCtx>("kelola_paket", async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = schema.parse(await jsonBody(req));
  const { rowCount } = await pool.query(
    `UPDATE faskes SET nama=COALESCE($2,nama), alamat=CASE WHEN $3::text IS NULL THEN alamat ELSE NULLIF($3,'') END,
       no_telepon=CASE WHEN $4::text IS NULL THEN no_telepon ELSE NULLIF($4,'') END,
       email=CASE WHEN $5::text IS NULL THEN email ELSE NULLIF($5,'') END, aktif=COALESCE($6,aktif) WHERE id=$1`,
    [id, b.nama ?? null, b.alamat ?? null, b.no_telepon ?? null, b.email ?? null, b.aktif ?? null]);
  if (!rowCount) throw new ApiError(404, "TIDAK_DITEMUKAN", "Faskes tidak ditemukan.");
  await pool.query("SELECT catat_audit($1,'ubah','faskes',$2,NULL,$3)", [user.id, id, JSON.stringify(b)]);
  return { ok: true };
});
