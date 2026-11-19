import { z } from "zod";
import { ApiError, handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({ kanal_id: z.number().int().positive(), ids: z.array(z.number().int().positive()).min(1).max(200) });

/** Saves the order made by dragging instruksi inside one method: `ids` is every instruksi of `kanal_id`, first to last. */
export const POST = handler("keuangan", async (req, user) => {
  const { kanal_id, ids } = schema.parse(await jsonBody(req));
  const usang = new ApiError(409, "URUTAN_USANG", "Daftar instruksi sudah berubah. Muat ulang halaman lalu coba lagi.");
  if (new Set(ids).size !== ids.length) throw new ApiError(422, "VALIDATION_ERROR", "Urutan tidak valid.");
  const ada = (await pool.query("SELECT id FROM instruksi_pembayaran WHERE kanal_id = $1", [kanal_id])).rows.map((r) => Number(r.id));
  if (ada.length !== ids.length || !ids.every((i) => ada.includes(i))) throw usang;
  await pool.query("UPDATE instruksi_pembayaran k SET urutan = u.n FROM unnest($1::bigint[]) WITH ORDINALITY AS u(id, n) WHERE k.id = u.id AND k.kanal_id = $2", [ids, kanal_id]);
  await pool.query("SELECT catat_audit($1,'ubah','kanal_pembayaran',$2,NULL,$3)", [user.id, kanal_id, JSON.stringify({ urutan_instruksi: ids })]);
  return { ok: true };
});
