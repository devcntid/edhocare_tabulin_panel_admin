import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/api";
import { pool } from "@/lib/db";
import { wajibKunciApi } from "@/lib/integrasi";

/** Machine-to-machine, sementara: membaca satu pasien berdasarkan `no_rm`. Mati (404) kecuali env `ALLOW_PASIEN_UJI=1`, sama seperti POST /api/integrasi/pasien. */
export async function GET(req: Request, ctx: { params: Promise<{ no_rm: string }> }) {
  try {
    if (process.env.ALLOW_PASIEN_UJI !== "1") throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
    wajibKunciApi(req);
    const { no_rm } = await ctx.params;
    const { rows } = await pool.query("SELECT no_rm, nama, no_hp, dibuat_pada FROM pasien WHERE no_rm = $1", [no_rm]);
    if (!rows[0]) throw new ApiError(404, "TIDAK_DITEMUKAN", "Pasien tidak ditemukan.");
    return NextResponse.json({ data: rows[0] });
  } catch (e) {
    return errorResponse(e);
  }
}
