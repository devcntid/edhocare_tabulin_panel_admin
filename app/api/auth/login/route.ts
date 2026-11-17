import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ApiError, errorResponse, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Email tidak valid."), password: z.string().min(1, "Password wajib diisi.") });

// Local-process throttle: 5 failures per email per 15 minutes.
const gagal = new Map<string, { n: number; sampai: number }>();
// Fixed hash so unknown emails cost the same as known ones.
const DUMMY = bcrypt.hashSync("tidak-dipakai", 10);

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) throw new ApiError(403, "ASAL_DITOLAK", "Permintaan ditolak.");
    const { email, password } = schema.parse(await jsonBody(req));
    const t = gagal.get(email);
    if (t && t.n >= 5 && t.sampai > Date.now()) throw new ApiError(429, "TERLALU_BANYAK", "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.");
    const { rows } = await pool.query("SELECT id, password_hash FROM pengguna_admin WHERE email = $1 AND aktif", [email]);
    const ok = await bcrypt.compare(password, rows[0]?.password_hash ?? DUMMY);
    if (!rows[0] || !ok) {
      gagal.set(email, { n: (t && t.sampai > Date.now() ? t.n : 0) + 1, sampai: Date.now() + 15 * 60_000 });
      throw new ApiError(401, "KREDENSIAL", "Email atau password salah.");
    }
    gagal.delete(email);
    await setSessionCookie(rows[0].id);
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return errorResponse(e);
  }
}
