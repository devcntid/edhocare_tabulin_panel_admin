import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse } from "@/lib/api";
import { pool } from "@/lib/db";
import { wajibKunciApi } from "@/lib/integrasi";
import { TOKEN_PASIEN_DETIK, buatTokenPasien } from "@/lib/pasien-token";

const schema = z.object({
  no_rm: z.string().trim().min(1, "no_rm tidak boleh kosong.").max(30).optional(),
  nama: z.string().trim().min(1, "nama tidak boleh kosong.").max(80).optional(),
  no_hp: z.string().regex(/^[0-9]{10,13}$/, "Nomor HP harus 10 sampai 13 digit angka.").optional(),
});

/** Machine-to-machine, sementara: membuat pasien uji dan langsung menerbitkan token pasien, selama data pasien Edelweiss belum terhubung.
 *  Field yang kosong dibuat otomatis. `no_rm` yang sudah ada ditolak (409). */
export async function POST(req: Request) {
  try {
    wajibKunciApi(req);
    const teks = (await req.text()).trim();
    let isi: unknown = {};
    if (teks) {
      try {
        isi = JSON.parse(teks);
      } catch {
        throw new ApiError(400, "BODY_TIDAK_VALID", "Body harus berupa JSON.");
      }
    }
    const b = schema.parse(isi);
    const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const no_rm = b.no_rm ?? `RM-TEST-${kode}`;
    const nama = b.nama ?? `Pasien Uji ${kode}`;
    const no_hp = b.no_hp ?? `0812${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
    await pool.query("INSERT INTO pasien (no_rm, nama, no_hp) VALUES ($1,$2,$3)", [no_rm, nama, no_hp]);
    return NextResponse.json(
      { data: { no_rm, nama, no_hp, access_token: await buatTokenPasien(no_rm), token_type: "Bearer", expires_in: TOKEN_PASIEN_DETIK } },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
