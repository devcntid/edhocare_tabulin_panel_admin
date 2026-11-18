import { ApiError } from "@/lib/api";

// Midtrans Sandbox only. MIDTRANS_SERVER_KEY must be a sandbox key; the base URL defaults to the sandbox host.
const BASE = () => process.env.MIDTRANS_BASE_URL ?? "https://api.sandbox.midtrans.com";

export function kunciServer(): string {
  const k = process.env.MIDTRANS_SERVER_KEY;
  if (!k) throw new ApiError(503, "TIDAK_DIKONFIGURASI", "Pembayaran gateway belum dikonfigurasi.");
  return k;
}

/** Optional per-charge notification URL (Midtrans `X-Override-Notification`): the callback no longer depends on the dashboard setting. */
const urlNotifikasi = () => process.env.MIDTRANS_NOTIFICATION_URL;

/**
 * Merchant VA prefix Midtrans puts in front of a custom BCA VA number (sandbox: 56652). When set, a patient's own VA is
 * prefix + 11 digits and is reused for every bill; when unset, each charge gets a random VA from Midtrans.
 */
export const prefixVa = () => process.env.MIDTRANS_VA_PREFIX?.trim() || null;
export const PANJANG_VA_KUSTOM = 11;

export const BANK_DIDUKUNG = ["bca", "bni", "bri", "cimb", "permata"] as const;
export type BankVa = (typeof BANK_DIDUKUNG)[number];

export type HasilCharge = { id_transaksi: string; nomor_va: string; bank: string };

/** Creates a bank-transfer virtual account charge (Core API). `gross_amount` is a whole-rupiah integer; `vaKustom` (BCA only) asks for a fixed number. */
export async function buatChargeVa(orderId: string, nominal: number, bank: BankVa, vaKustom?: string): Promise<HasilCharge> {
  const res = await fetch(`${BASE()}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${kunciServer()}:`).toString("base64")}`,
      ...(urlNotifikasi() ? { "X-Override-Notification": urlNotifikasi() as string } : {}),
    },
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: orderId, gross_amount: nominal },
      bank_transfer: { bank, ...(vaKustom ? { va_number: vaKustom } : {}) },
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new ApiError(502, "GATEWAY_GAGAL", "Gateway pembayaran tidak dapat dihubungi.");
  });
  const j = (await res.json().catch(() => null)) as { status_code?: string; transaction_id?: string; va_numbers?: { bank: string; va_number: string }[]; permata_va_number?: string } | null;
  // Midtrans answers 201 on success; a failed charge still returns HTTP 200 with a 4xx status_code in the body.
  if (!j || j.status_code !== "201") throw new ApiError(502, "GATEWAY_GAGAL", "Gateway pembayaran menolak permintaan.");
  const va = j.va_numbers?.[0]?.va_number ?? j.permata_va_number;
  if (!va || !j.transaction_id) throw new ApiError(502, "GATEWAY_GAGAL", "Respons gateway tidak lengkap.");
  return { id_transaksi: j.transaction_id, nomor_va: va, bank };
}

export type StatusTransaksi = { status_code: string; transaction_status: string; gross_amount: string; fraud_status?: string };

/**
 * Authoritative status of an order, asked from Midtrans with the server key (Midtrans' recommended way to trust a notification).
 * The notification body itself is never believed: anyone can post to the callback URL, but only Midtrans answers this call.
 * Returns null when Midtrans does not know the order.
 */
export async function ambilStatusTransaksi(orderId: string): Promise<StatusTransaksi | null> {
  const res = await fetch(`${BASE()}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${kunciServer()}:`).toString("base64")}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new ApiError(502, "GATEWAY_GAGAL", "Gateway pembayaran tidak dapat dihubungi.");
  });
  const j = (await res.json().catch(() => null)) as (Partial<StatusTransaksi> & { order_id?: string }) | null;
  if (!j) throw new ApiError(502, "GATEWAY_GAGAL", "Respons gateway tidak dapat dibaca.");
  if (j.status_code === "404") return null;
  if (j.order_id !== orderId || !j.status_code || !j.transaction_status || !j.gross_amount) throw new ApiError(502, "GATEWAY_GAGAL", "Respons gateway tidak lengkap.");
  return { status_code: j.status_code, transaction_status: j.transaction_status, gross_amount: j.gross_amount, fraud_status: j.fraud_status };
}
