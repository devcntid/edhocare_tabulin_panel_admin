import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";
import { wajibKunciApi } from "@/lib/integrasi";
import { TOKEN_PASIEN_DETIK, buatTokenPasien } from "@/lib/pasien-token";

const schema = z.object({ no_rm: z.string().trim().min(1, "no_rm wajib diisi.").max(30) });

/** Machine-to-machine: issues a patient-app access token for a known No. RM. Stand-in for the Portal Pasien login until Edelweiss provides it. */
export async function POST(req: Request) {
  try {
    wajibKunciApi(req);
    const { no_rm } = schema.parse(await jsonBody(req));
    const { rowCount } = await pool.query("SELECT 1 FROM pasien WHERE no_rm = $1", [no_rm]);
    if (!rowCount) throw new ApiError(404, "TIDAK_DITEMUKAN", "Pasien tidak ditemukan.");
    return NextResponse.json({ data: { access_token: await buatTokenPasien(no_rm), token_type: "Bearer", expires_in: TOKEN_PASIEN_DETIK } });
  } catch (e) {
    return errorResponse(e);
  }
}
