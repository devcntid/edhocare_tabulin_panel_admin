// Payment gateway (Midtrans Sandbox, and Faspay through the pay-gate orchestrator): checkout for a bill and the payment notification (callback).
// The balance changes only through terima_setoran_api, idempotent on the gateway order id, so a repeated
// notification never credits twice. Every settled notification lands in log_setoran_api (the payment log).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import type { PasienApp } from "@/lib/app-api";
import { pool } from "@/lib/db";
import { ambilTransaksi, buatTransaksi, rahasiaWebhook, statusLokal, verifikasiWebhook, type MetodeGateway } from "@/lib/faspay";
import { BANK_DIDUKUNG, PANJANG_VA_KUSTOM, ambilStatusTransaksi, buatChargeVa, prefixVa } from "@/lib/midtrans";

// `kanal` (the method code, e.g. "ovo") picks the Faspay route; without it the Midtrans VA flow runs as before.
const checkoutSchema = z.object({ bank: z.enum(BANK_DIDUKUNG, "Bank tidak didukung.").default("bca"), kanal: z.string().trim().min(1).max(60).optional() });

/** Default VA for a new registration: the Midtrans merchant prefix + a sequence number, or null (the database then makes its own). */
export async function vaBawaan(): Promise<string | null> {
  const prefix = prefixVa();
  if (!prefix) return null;
  const n = (await pool.query("SELECT nextval('va_seq')::text AS n")).rows[0].n as string;
  return prefix + n.padStart(16 - prefix.length, "0");
}

/**
 * A patient whose VA is prefix + 11 digits pays every bill to that same number, so Midtrans can hold only one open charge for it.
 * Open charges are checked with Midtrans first (an expired one must not block); a live one refuses the new checkout.
 */
async function pastikanTidakAdaPembayaranMenunggu(pendaftaranId: number) {
  const terbuka = (
    await pool.query(
      "SELECT pg.order_id, g.nomor FROM pembayaran_gateway pg JOIN tagihan g ON g.id = pg.tagihan_id WHERE pg.pendaftaran_id = $1 AND pg.status = 'menunggu' ORDER BY pg.id",
      [pendaftaranId],
    )
  ).rows as { order_id: string; nomor: string }[];
  for (const t of terbuka) {
    const s = (await ambilStatusTransaksi(t.order_id))?.transaction_status;
    const akhir = s === "expire" ? "kedaluwarsa" : !s || ["deny", "cancel", "failure"].includes(s) ? "gagal" : null;
    if (!akhir) throw new ApiError(409, "PEMBAYARAN_MENUNGGU", `Masih ada pembayaran yang menunggu untuk tagihan ${t.nomor}. Selesaikan pembayaran itu atau tunggu sampai kedaluwarsa sebelum membayar lagi.`);
    await pool.query("UPDATE pembayaran_gateway SET status = $2, diperbarui_pada = now() WHERE order_id = $1 AND status = 'menunggu'", [t.order_id, akhir]);
  }
}

/** Creates a VA charge for an unpaid bill owned by the patient. */
export async function checkoutTagihan(pasien: PasienApp, nomor: string, body: unknown) {
  const { bank, kanal } = checkoutSchema.parse(body ?? {});
  const g = (
    await pool.query(
      `SELECT g.id, g.nomor, g.nominal, g.status, p.id AS pendaftaran_id, p.status_pendaftaran, p.no_va
       FROM tagihan g JOIN pendaftaran p ON p.id = g.pendaftaran_id WHERE p.no_rm = $1 AND g.nomor = $2`,
      [pasien.no_rm, nomor],
    )
  ).rows[0];
  if (!g) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  if (g.status === "lunas") throw new ApiError(409, "TAGIHAN_SUDAH_LUNAS", "Tagihan ini sudah lunas.");
  if (g.status_pendaftaran !== "aktif") throw new ApiError(409, "PENDAFTARAN_TIDAK_AKTIF", "Pendaftaran Tabulin belum aktif.");
  if (kanal) return checkoutFaspay(g, kanal);
  const nominal = Number(g.nominal);
  const orderId = `${g.nomor}-${randomBytes(4).toString("hex")}`;
  const prefix = prefixVa();
  const vaKustom = bank === "bca" && prefix && typeof g.no_va === "string" && g.no_va.startsWith(prefix) && g.no_va.length === prefix.length + PANJANG_VA_KUSTOM ? g.no_va.slice(prefix.length) : undefined;
  if (vaKustom) await pastikanTidakAdaPembayaranMenunggu(g.pendaftaran_id);
  const c = await buatChargeVa(orderId, nominal, bank, vaKustom);
  await pool.query(
    "INSERT INTO pembayaran_gateway (order_id, pendaftaran_id, tagihan_id, nominal, bank, nomor_va, id_transaksi_gateway) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [orderId, g.pendaftaran_id, g.id, nominal, bank, c.nomor_va, c.id_transaksi],
  );
  return { id_pembayaran: orderId, id_tagihan: g.nomor, nominal, bank, nomor_va: c.nomor_va, status: "menunggu" };
}

/** Faspay checkout for one bill: the method must be active and mapped to a gateway route. An open, unexpired charge for the same bill and method is returned again instead of making a second one. */
async function checkoutFaspay(g: { id: number; nomor: string; nominal: number | string; pendaftaran_id: number }, kode: string) {
  const k = (await pool.query("SELECT id, kode, nama, konfigurasi->>'pg_code' AS pg_code, metode_gateway FROM kanal_pembayaran WHERE kode = $1 AND aktif", [kode])).rows[0] as
    { id: number; kode: string; nama: string; pg_code: string | null; metode_gateway: MetodeGateway | null } | undefined;
  if (!k || !k.pg_code || !k.metode_gateway) throw new ApiError(404, "TIDAK_DITEMUKAN", "Metode pembayaran tidak tersedia.");
  const nominal = Number(g.nominal);
  const hasil = (orderId: string, instruksi: unknown, noVa: string | null) => ({ id_pembayaran: orderId, id_tagihan: g.nomor, nominal, bank: k.nama, nomor_va: noVa, kanal: k.kode, metode: k.metode_gateway, instruksi_pembayaran: instruksi ?? null, status: "menunggu" });
  const buka = (await pool.query(
    "SELECT order_id, instruksi, nomor_va FROM pembayaran_gateway WHERE tagihan_id = $1 AND kanal_id = $2 AND penyedia = 'faspay' AND status = 'menunggu' AND (kedaluwarsa_pada IS NULL OR kedaluwarsa_pada > now()) ORDER BY id DESC LIMIT 1",
    [g.id, k.id])).rows[0];
  if (buka) return hasil(buka.order_id, buka.instruksi, buka.nomor_va);
  const orderId = `${g.nomor}-${randomBytes(4).toString("hex")}`;
  const t = await buatTransaksi({ referensi: orderId, nominal, metode: k.metode_gateway, kanal: k.pg_code, deskripsi: `Tabulin ${g.nomor}` });
  if (statusLokal(t.status) === "gagal") throw new ApiError(502, "GATEWAY_GAGAL", "Gateway pembayaran menolak permintaan.");
  const noVa = typeof t.payment_instruction?.virtual_account_no === "string" ? t.payment_instruction.virtual_account_no : null; // only VA channels have one
  const habis = t.expires_at && !Number.isNaN(Date.parse(t.expires_at)) ? new Date(t.expires_at) : null;
  await pool.query(
    "INSERT INTO pembayaran_gateway (order_id, penyedia, pendaftaran_id, tagihan_id, nominal, bank, id_transaksi_gateway, kanal_id, instruksi, kedaluwarsa_pada, nomor_va) VALUES ($1,'faspay',$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [orderId, g.pendaftaran_id, g.id, nominal, k.nama, t.transaction_id, k.id, t.payment_instruction ? JSON.stringify(t.payment_instruction) : null, habis, noVa]);
  return hasil(orderId, t.payment_instruction, noVa);
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

  return kreditSetoran(row, orderId, nominal);
}

/** Credits the paid order to the ledger (idempotent on the order id) and records it in the payment log. */
async function kreditSetoran(row: { no_va: string; nomor_tagihan: string }, orderId: string, nominal: number) {
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

const faspaySchema = z.object({ event_type: z.string().min(1), transaction: z.object({ transaction_id: z.string().min(1), merchant_reference: z.string().min(1).max(100) }) });

/**
 * Handles a signed webhook from the gateway. The signature is required when FASPAY_WEBHOOK_SECRET is set, and the body is still only a hint:
 * the real status and amount are read back from the gateway with our own token, so a forged or replayed webhook cannot credit anything.
 * Delivery is at-least-once; crediting is idempotent on the order id.
 */
export async function terimaNotifikasiFaspay(isi: string, timestamp: string | null, tandatangan: string | null) {
  const secret = rahasiaWebhook();
  if (secret && !verifikasiWebhook(isi, timestamp, tandatangan, secret)) {
    await catat(null, null, null, "ditolak", { kode: "TANDA_TANGAN_TIDAK_VALID", pesan: "Webhook gateway ditolak: tanda tangan atau waktu tidak valid." });
    throw new ApiError(401, "BELUM_LOGIN", "Notifikasi tidak valid.");
  }
  let json: unknown;
  try { json = JSON.parse(isi); } catch { json = null; }
  const n = faspaySchema.safeParse(json);
  if (!n.success) {
    await catat(null, null, null, "ditolak", { kode: "NOTIFIKASI_TIDAK_VALID", pesan: "Webhook gateway ditolak: isi tidak dikenali." });
    throw new ApiError(422, "VALIDATION_ERROR", "Notifikasi tidak valid.");
  }
  const { transaction_id: idGateway, merchant_reference: orderId } = n.data.transaction;
  const row = (
    await pool.query(
      `SELECT pg.*, g.nomor AS nomor_tagihan, p.no_va FROM pembayaran_gateway pg
       JOIN tagihan g ON g.id = pg.tagihan_id JOIN pendaftaran p ON p.id = pg.pendaftaran_id WHERE pg.order_id = $1 AND pg.penyedia = 'faspay'`,
      [orderId],
    )
  ).rows[0];
  if (!row || (row.id_transaksi_gateway && row.id_transaksi_gateway !== idGateway)) {
    await catat(null, orderId, null, "ditolak", { kode: "PESANAN_TIDAK_DIKENAL", pesan: "Webhook untuk pesanan yang tidak dikenal." });
    throw new ApiError(404, "TIDAK_DITEMUKAN", "Pesanan tidak dikenal.");
  }
  const t = await ambilTransaksi(idGateway);
  if (!t || (t.merchant_reference && t.merchant_reference !== orderId)) {
    await catat(row.no_va, orderId, null, "ditolak", { kode: "PESANAN_TIDAK_DIKENAL", pesan: "Gateway tidak mengenal transaksi ini." });
    throw new ApiError(404, "TIDAK_DITEMUKAN", "Pesanan tidak dikenal.");
  }
  const nominal = Number(row.nominal);
  if (t.amount !== undefined && Number(t.amount) !== nominal) {
    await catat(row.no_va, orderId, nominal, "ditolak", { kode: "NOMINAL_TIDAK_SESUAI", pesan: "Nominal gateway berbeda dengan pesanan." });
    throw new ApiError(422, "NOMINAL_TIDAK_SESUAI", "Nominal tidak sesuai dengan pesanan.");
  }
  const status = statusLokal(t.status);
  if (status === "berhasil") return kreditSetoran(row, orderId, nominal);
  if (status !== "menunggu") await pool.query("UPDATE pembayaran_gateway SET status = $2, diperbarui_pada = now() WHERE order_id = $1 AND status = 'menunggu'", [orderId, status]);
  return { order_id: orderId, status: status === "menunggu" ? row.status : status };
}
