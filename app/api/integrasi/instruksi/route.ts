import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { pool } from "@/lib/db";
import { wajibKunciApi } from "@/lib/integrasi";

export const dynamic = "force-dynamic";

/** Customer-facing payment instructions for the app. Only active methods; internal `konfigurasi` is never returned. */
export async function GET(req: Request) {
  try {
    wajibKunciApi(req);
    const { rows } = await pool.query(
      `SELECT k.kode, k.nama, k.deskripsi, i.judul, i.isi, i.nama_bank, i.nama_rekening, i.nomor_rekening
       FROM kanal_pembayaran k JOIN instruksi_pembayaran i ON i.kanal_id = k.id
       WHERE k.aktif AND i.aktif ORDER BY k.id, i.urutan, i.id`);
    return NextResponse.json({ data: rows });
  } catch (e) {
    return errorResponse(e);
  }
}
