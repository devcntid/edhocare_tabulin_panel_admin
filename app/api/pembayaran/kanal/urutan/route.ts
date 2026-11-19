import { z } from "zod";
import { ApiError, handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) });

/**
 * Saves the order made by dragging methods in the panel. `ids` are the methods on screen, first to last. The list may be filtered or one page of
 * several, so those methods only trade places among the slots they already occupy; methods that were not on screen keep theirs.
 */
export const POST = handler("keuangan", async (req, user) => {
  const { ids } = schema.parse(await jsonBody(req));
  if (new Set(ids).size !== ids.length) throw new ApiError(422, "VALIDATION_ERROR", "Urutan tidak valid.");
  const semua = (await pool.query("SELECT id FROM kanal_pembayaran ORDER BY urutan, id")).rows.map((r) => Number(r.id));
  if (!ids.every((i) => semua.includes(i))) throw new ApiError(409, "URUTAN_USANG", "Daftar metode sudah berubah. Muat ulang halaman lalu coba lagi.");
  const dipilih = new Set(ids);
  let n = 0;
  const akhir = semua.map((id) => (dipilih.has(id) ? ids[n++] : id));
  await pool.query("UPDATE kanal_pembayaran k SET urutan = u.n FROM unnest($1::bigint[]) WITH ORDINALITY AS u(id, n) WHERE k.id = u.id", [akhir]);
  await pool.query("SELECT catat_audit($1,'ubah','kanal_pembayaran',NULL,NULL,$2)", [user.id, JSON.stringify({ urutan: akhir })]);
  return { ok: true };
});
