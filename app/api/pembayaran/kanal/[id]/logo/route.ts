import { ApiError, errorResponse, handler, idParam, type IdCtx } from "@/lib/api";
import { pool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

const MAKS = 512 * 1024;
// The declared type must match the file's first bytes, so a renamed file cannot slip through. SVG is left out on purpose (it can carry script).
const TANDA: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47].every((x, i) => b[i] === x),
  "image/jpeg": (b) => [0xff, 0xd8, 0xff].every((x, i) => b[i] === x),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

/** Method image, shown in the panel. */
export async function GET(_req: Request, ctx: IdCtx) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "BELUM_LOGIN", "Silakan login terlebih dahulu.");
    if (!can(user.peran, "lihat")) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
    const l = (await pool.query("SELECT tipe, isi FROM kanal_logo WHERE kanal_id = $1", [await idParam(ctx)])).rows[0];
    if (!l) throw new ApiError(404, "TIDAK_DITEMUKAN", "Gambar tidak ditemukan.");
    return new Response(new Uint8Array(l.isi), { headers: { "Content-Type": l.tipe, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export const PUT = handler<IdCtx>("keuangan", async (req, user, ctx) => {
  const id = await idParam(ctx);
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!(f instanceof File) || f.size === 0) throw new ApiError(422, "VALIDATION_ERROR", "Pilih file gambar.", { file: "Field ini wajib diisi." });
  const tipe = f.type.toLowerCase();
  if (!TANDA[tipe]) throw new ApiError(415, "TIPE_BERKAS_TIDAK_DIDUKUNG", "Tipe gambar tidak didukung. Gunakan PNG, JPG, atau WebP.");
  if (f.size > MAKS) throw new ApiError(413, "BERKAS_TERLALU_BESAR", "Ukuran gambar maksimal 512 KB.");
  const isi = Buffer.from(await f.arrayBuffer());
  if (!TANDA[tipe](isi)) throw new ApiError(415, "TIPE_BERKAS_TIDAK_DIDUKUNG", "Isi berkas tidak sesuai tipenya.");
  if (!(await pool.query("SELECT 1 FROM kanal_pembayaran WHERE id = $1", [id])).rowCount) throw new ApiError(404, "TIDAK_DITEMUKAN", "Metode pembayaran tidak ditemukan.");
  await pool.query("INSERT INTO kanal_logo (kanal_id, tipe, isi) VALUES ($1,$2,$3) ON CONFLICT (kanal_id) DO UPDATE SET tipe = EXCLUDED.tipe, isi = EXCLUDED.isi, diubah_pada = now()", [id, tipe, isi]);
  await pool.query("SELECT catat_audit($1,'ubah','kanal_pembayaran',$2,NULL,$3)", [user.id, id, JSON.stringify({ gambar: tipe, ukuran: isi.length })]);
  return { ok: true };
});

export const DELETE = handler<IdCtx>("keuangan", async (_req, user, ctx) => {
  const id = await idParam(ctx);
  await pool.query("DELETE FROM kanal_logo WHERE kanal_id = $1", [id]);
  await pool.query("SELECT catat_audit($1,'ubah','kanal_pembayaran',$2,NULL,$3)", [user.id, id, JSON.stringify({ gambar: null })]);
  return { ok: true };
});
