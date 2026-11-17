import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, jsonBody, toApiError } from "@/lib/api";
import { pool } from "@/lib/db";
import { wajibKunciApi } from "@/lib/integrasi";

const schema = z.object({
  no_va: z.string().trim().min(1, "no_va wajib diisi."),
  referensi: z.string().trim().min(1, "referensi wajib diisi.").max(100),
  tanggal_bayar: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "tanggal_bayar harus YYYY-MM-DD."),
  nominal: z.number().int("nominal harus bilangan bulat.").positive("nominal harus lebih dari 0.").max(10_000_000_000),
  nomor_tagihan: z.string().trim().min(1).optional(),
});

async function catat(raw: unknown, hasil: "diterima" | "duplikat" | "ditolak", extra: { kode?: string; pesan?: string; nomor?: string }) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v == null ? null : String(v).slice(0, n));
  await pool
    .query(
      "INSERT INTO log_setoran_api (no_va, referensi, nominal, tanggal_bayar, hasil, kode_galat, pesan, nomor_transaksi) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [s(r.no_va, 40), s(r.referensi, 100), Number.isSafeInteger(r.nominal) ? r.nominal : null, s(r.tanggal_bayar, 20), hasil, extra.kode ?? null, extra.pesan ?? null, extra.nomor ?? null],
    )
    .catch((e) => console.error("log_setoran_api", e));
}

/** Machine-to-machine: the customer app / bank API reports a received deposit. Idempotent on `referensi`. Every call is logged. */
export async function POST(req: Request) {
  let raw: unknown = null;
  try {
    wajibKunciApi(req);
    raw = await jsonBody(req);
    const b = schema.parse(raw);
    const { rows } = await pool.query("SELECT * FROM terima_setoran_api($1,$2,$3,$4,$5)", [b.no_va, b.referensi, b.tanggal_bayar, b.nominal, b.nomor_tagihan ?? null]);
    const r = rows[0];
    await catat(raw, r.baru ? "diterima" : "duplikat", { nomor: r.nomor });
    return NextResponse.json({ data: { nomor: r.nomor, baru: r.baru } }, { status: r.baru ? 201 : 200 });
  } catch (e) {
    const a = toApiError(e);
    if (!(e instanceof ApiError) || (e.status !== 401 && e.status !== 503)) await catat(raw, "ditolak", { kode: a.code, pesan: a.message });
    return errorResponse(e);
  }
}
