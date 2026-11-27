import { z } from "zod";
import { handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";
import { simpanTarifPaket } from "@/lib/services/master";

const schema = z.object({
  cara_id: z.number().int().positive(),
  kelas_id: z.number().int().positive(),
  // {faskes_id: harga} sets the tariff; null clears it so cara price + kelas price applies again.
  harga: z.record(z.string(), z.number()).nullable(),
});

/** Tarif paket (cara x kelas per faskes). Existing registrations keep the tariff they were created with. */
export const PATCH = handler("kelola_paket", async (req, user) => {
  const b = schema.parse(await jsonBody(req));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { lama } = await simpanTarifPaket(c, b.cara_id, b.kelas_id, b.harga);
    await c.query("SELECT catat_audit($1,'ubah','harga_paket',NULL,$2,$3)", [user.id, JSON.stringify({ cara_id: b.cara_id, kelas_id: b.kelas_id, harga: lama }), JSON.stringify({ cara_id: b.cara_id, kelas_id: b.kelas_id, harga: b.harga })]);
    await c.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
