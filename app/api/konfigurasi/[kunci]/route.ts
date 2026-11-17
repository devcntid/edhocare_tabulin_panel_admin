import { z } from "zod";
import { ApiError, handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

type Ctx = { params: Promise<{ kunci: string }> };

// Allowed range per rule. Keys outside this list cannot be edited through the API.
const BATAS: Record<string, { min: number; max: number; nama: string }> = {
  dp_persen: { min: 1, max: 90, nama: "Uang muka" },
  target_persen: { min: 1, max: 100, nama: "Target tabungan" },
  milestone_minggu: { min: 1, max: 42, nama: "Milestone" },
  hpl_minggu: { min: 1, max: 45, nama: "Usia kehamilan saat HPL" },
  batas_usia_kehamilan_hari: { min: 1, max: 330, nama: "Batas usia kehamilan" },
  hari_jatuh_tempo: { min: 1, max: 28, nama: "Tanggal jatuh tempo" },
  hari_tempo_dp: { min: 1, max: 90, nama: "Batas waktu DP" },
  toleransi_hari: { min: 0, max: 30, nama: "Toleransi" },
  fitur_klaim_aktif: { min: 0, max: 1, nama: "Fitur klaim pembayaran" },
};

const schema = z.object({ nilai: z.number("Nilai harus berupa angka.").int("Nilai harus bilangan bulat.") });

export const PATCH = handler<Ctx>("kelola_paket", async (req, user, ctx) => {
  const kunci = (await ctx.params).kunci;
  const batas = BATAS[kunci];
  if (!batas) throw new ApiError(404, "TIDAK_DITEMUKAN", "Aturan tidak ditemukan.");
  const { nilai } = schema.parse(await jsonBody(req));
  if (nilai < batas.min || nilai > batas.max) {
    throw new ApiError(422, "VALIDASI", "Data tidak valid.", { nilai: `${batas.nama} harus antara ${batas.min} dan ${batas.max}.` });
  }
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const semua = Object.fromEntries((await c.query("SELECT kunci, nilai FROM konfigurasi FOR UPDATE")).rows.map((r) => [r.kunci, Number(r.nilai)]));
    if (!(kunci in semua)) throw new ApiError(404, "TIDAK_DITEMUKAN", "Aturan tidak ditemukan.");
    const baru = { ...semua, [kunci]: nilai };
    if (baru.milestone_minggu >= baru.hpl_minggu) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { nilai: "Milestone harus lebih awal dari usia kehamilan saat HPL." });
    if (baru.dp_persen > baru.target_persen) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { nilai: "DP tidak boleh lebih besar dari target tabungan." });
    await c.query("UPDATE konfigurasi SET nilai = to_jsonb($2::int) WHERE kunci = $1", [kunci, nilai]);
    await c.query("SELECT catat_audit($1,'ubah','konfigurasi',NULL,$2,$3)", [user.id, JSON.stringify({ kunci, nilai: semua[kunci] }), JSON.stringify({ kunci, nilai })]);
    await c.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
