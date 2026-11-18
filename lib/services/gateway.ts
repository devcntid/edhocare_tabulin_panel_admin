// Payment gateway (Midtrans Sandbox): VA checkout for a bill and the payment notification (callback).
// The balance changes only through terima_setoran_api, idempotent on the gateway order id, so a repeated
// notification never credits twice. Every settled notification lands in log_setoran_api (the payment log).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import type { PasienApp } from "@/lib/app-api";
import { pool } from "@/lib/db";
import { BANK_DIDUKUNG, ambilStatusTransaksi, buatChargeVa } from "@/lib/midtrans";

const checkoutSchema = z.object({ bank: z.enum(BANK_DIDUKUNG, "Bank tidak didukung.").default("bca") });

/** Creates a VA charge for an unpaid bill owned by the patient. */
export async function checkoutTagihan(pasien: PasienApp, nomor: string, body: unknown) {
  const { bank } = checkoutSchema.parse(body ?? {});
  const g = (
    await pool.query(
      `SELECT g.id, g.nomor, g.nominal, g.status, p.id AS pendaftaran_id, p.status_pendaftaran
       FROM tagihan g JOIN pendaftaran p ON p.id = g.pendaftaran_id WHERE p.no_rm = $1 AND g.nomor = $2`,
      [pasien.no_rm, nomor],
    )
  ).rows[0];
  if (!g) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  if (g.status === "lunas") throw new ApiError(409, "TAGIHAN_SUDAH_LUNAS", "Tagihan ini sudah lunas.");
  if (g.status_pendaftaran !== "aktif") throw new ApiError(409, "PENDAFTARAN_TIDAK_AKTIF", "Pendaftaran Tabulin belum aktif.");
  const nominal = Number(g.nominal);
  const orderId = `${g.nomor}-${randomBytes(4).toString("hex")}`;
  const c = await buatChargeVa(orderId, nominal, bank);
  await pool.query(
    "INSERT INTO pembayaran_gateway (order_id, pendaftaran_id, tagihan_id, nominal, bank, nomor_va, id_transaksi_gateway) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [orderId, g.pendaftaran_id, g.id, nominal, bank, c.nomor_va, c.id_transaksi],
  );
  return { id_pembayaran: orderId, id_tagihan: g.nomor, nominal, bank, nomor_va: c.nomor_va, status: "menunggu" };
}

const notifSchema = z.object({ order_id: z.string().min(1).max(100) });

async function catat(noVa: string | null, ref: string | null, nominal: number | null, hasil: "diterima" | "duplikat" | "ditolak", extra: { kode?: string; pesan?: string; nomor?: string | null }) {
  await pool
    .query(
      "INSERT INTO log_setoran_api (no_va, referensi, nominal, tanggal_bayar, hasil, kode_galat, pesan, nomor_transaksi) VALUES ($1,$2,$3,to_char(today_jkt(),'YYYY-MM-DD'),$4,$5,$6,$7)",
      [noVa, ref, nominal, hasil, extra.kode ?? null, extra.pesan ?? null, extra.nomor ?? null],
    )
    .catch((e) => console.error("log_setoran_api", e));
}

/**
 * Handles a Midtrans HTTP notification. Only `order_id` is read from the body; the real status and amount are asked from Midtrans
 * (see ambilStatusTransaksi), so a forged or replayed notification cannot credit anything. Refusals are logged in Log Setoran API.
 */
export async function terimaNotifikasiMidtrans(raw: unknown) {
  const n = notifSchema.safeParse(raw);
  if (!n.success) {
    await catat(null, null, null, "ditolak", { kode: "NOTIFIKASI_TIDAK_VALID", pesan: "Notifikasi gateway ditolak: order_id tidak ada." });
    throw new ApiError(401, "BELUM_LOGIN", "Notifikasi tidak valid.");
  }
  const orderId = n.data.order_id;
  const b = await ambilStatusTransaksi(orderId);
  if (!b) {
    await catat(null, orderId, null, "ditolak", { kode: "PESANAN_TIDAK_DIKENAL", pesan: "Midtrans tidak mengenal pesanan ini." });
    throw new ApiError(404, "TIDAK_DITEMUKAN", "Pesanan tidak dikenal.");
  }
  const row = (
    await pool.query(
      `SELECT pg.*, g.nomor AS nomor_tagihan, p.no_va FROM pembayaran_gateway pg
       JOIN tagihan g ON g.id = pg.tagihan_id JOIN pendaftaran p ON p.id = pg.pendaftaran_id WHERE pg.order_id = $1`,
      [orderId],
    )
  ).rows[0];
  if (!row) {
    await catat(null, orderId, Number(b.gross_amount) || null, "ditolak", { kode: "PESANAN_TIDAK_DIKENAL", pesan: "Notifikasi untuk pesanan yang tidak dikenal." });
    throw new ApiError(404, "TIDAK_DITEMUKAN", "Pesanan tidak dikenal.");
  }
  const nominal = Number(row.nominal);
  if (Number(b.gross_amount) !== nominal) {
    await catat(row.no_va, orderId, nominal, "ditolak", { kode: "NOMINAL_TIDAK_SESUAI", pesan: "Nominal notifikasi berbeda dengan pesanan." });
    throw new ApiError(422, "NOMINAL_TIDAK_SESUAI", "Nominal tidak sesuai dengan pesanan.");
  }

  const berhasil = b.transaction_status === "settlement" || (b.transaction_status === "capture" && (b.fraud_status ?? "accept") === "accept");
  if (!berhasil) {
    const status = b.transaction_status === "expire" ? "kedaluwarsa" : ["deny", "cancel", "failure"].includes(b.transaction_status) ? "gagal" : null;
    if (status) await pool.query("UPDATE pembayaran_gateway SET status = $2, diperbarui_pada = now() WHERE order_id = $1 AND status = 'menunggu'", [orderId, status]);
    return { order_id: orderId, status: status ?? row.status };
  }

  try {
    const r = (await pool.query("SELECT * FROM terima_setoran_api($1,$2,today_jkt(),$3,$4)", [row.no_va, orderId, nominal, row.nomor_tagihan])).rows[0];
    await pool.query("UPDATE pembayaran_gateway SET status = 'berhasil', nomor_transaksi = $2, diperbarui_pada = now() WHERE order_id = $1", [orderId, r.nomor]);
    await catat(row.no_va, orderId, nominal, r.baru ? "diterima" : "duplikat", { nomor: r.nomor });
    return { order_id: orderId, status: "berhasil", nomor_transaksi: r.nomor };
  } catch (e) {
    const pg = e as { message?: string };
    await catat(row.no_va, orderId, nominal, "ditolak", { kode: "DITOLAK", pesan: pg.message?.slice(0, 200) });
    throw e;
  }
}
