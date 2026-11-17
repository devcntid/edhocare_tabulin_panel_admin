import bcrypt from "bcryptjs";
import { z } from "zod";
import { ApiError, handler, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({ aktif: z.boolean().optional(), password: z.string().min(10, "Password minimal 10 karakter.").optional() })
  .refine((v) => v.aktif !== undefined || v.password, "Tidak ada perubahan.");

export const PATCH = handler<IdCtx>("kelola_pengguna", async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = schema.parse(await jsonBody(req));
  if (id === user.id && b.aktif === false) throw new ApiError(409, "DILARANG", "Anda tidak dapat menonaktifkan akun sendiri.");
  const hash = b.password ? await bcrypt.hash(b.password, 10) : null;
  const { rowCount } = await pool.query(
    "UPDATE pengguna_admin SET aktif = COALESCE($2, aktif), password_hash = COALESCE($3, password_hash) WHERE id = $1", [id, b.aktif ?? null, hash]);
  if (!rowCount) throw new ApiError(404, "TIDAK_DITEMUKAN", "Pengguna tidak ditemukan.");
  await pool.query("SELECT catat_audit($1,'ubah','pengguna_admin',$2,NULL,$3)", [user.id, id, JSON.stringify({ aktif: b.aktif, password_diganti: !!b.password })]);
  return { ok: true };
});
