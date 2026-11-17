import { z } from "zod";
import { ApiError, handler, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({
  judul: z.string().trim().min(1, "Judul wajib diisi.").max(120).optional(),
  isi: z.string().trim().min(1, "Isi instruksi wajib diisi.").max(1000).optional(),
  nama_bank: z.string().trim().max(60).optional(),
  nama_rekening: z.string().trim().max(80).optional(),
  nomor_rekening: z.string().trim().regex(/^[0-9 ]*$/, "Nomor rekening hanya angka.").max(30).optional(),
  aktif: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "Tidak ada perubahan.");

export const PATCH = handler<IdCtx>("keuangan", async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = schema.parse(await jsonBody(req));
  const { rowCount } = await pool.query(
    `UPDATE instruksi_pembayaran SET judul=COALESCE($2,judul), isi=COALESCE($3,isi), nama_bank=COALESCE($4,nama_bank),
       nama_rekening=COALESCE($5,nama_rekening), nomor_rekening=COALESCE($6,nomor_rekening), aktif=COALESCE($7,aktif) WHERE id=$1`,
    [id, b.judul ?? null, b.isi ?? null, b.nama_bank ?? null, b.nama_rekening ?? null, b.nomor_rekening ?? null, b.aktif ?? null]);
  if (!rowCount) throw new ApiError(404, "TIDAK_DITEMUKAN", "Instruksi tidak ditemukan.");
  await pool.query("SELECT catat_audit($1,'ubah','instruksi_pembayaran',$2,NULL,$3)", [user.id, id, JSON.stringify(b)]);
  return { ok: true };
});
