import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api";

// Midtrans Sandbox only. MIDTRANS_SERVER_KEY must be a sandbox key; the base URL defaults to the sandbox host.
const BASE = () => process.env.MIDTRANS_BASE_URL ?? "https://api.sandbox.midtrans.com";

export function kunciServer(): string {
  const k = process.env.MIDTRANS_SERVER_KEY;
  if (!k) throw new ApiError(503, "TIDAK_DIKONFIGURASI", "Pembayaran gateway belum dikonfigurasi.");
  return k;
}

export const BANK_DIDUKUNG = ["bca", "bni", "bri", "cimb", "permata"] as const;
export type BankVa = (typeof BANK_DIDUKUNG)[number];

export type HasilCharge = { id_transaksi: string; nomor_va: string; bank: string };

/** Creates a bank-transfer virtual account charge (Core API). `gross_amount` is a whole-rupiah integer. */
export async function buatChargeVa(orderId: string, nominal: number, bank: BankVa): Promise<HasilCharge> {
  const res = await fetch(`${BASE()}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${kunciServer()}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: orderId, gross_amount: nominal },
      bank_transfer: { bank },
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

/** signature_key = SHA512(order_id + status_code + gross_amount + server key). Compared in constant time. */
export function tandaTanganValid(n: { order_id?: unknown; status_code?: unknown; gross_amount?: unknown; signature_key?: unknown }): boolean {
  if ([n.order_id, n.status_code, n.gross_amount, n.signature_key].some((v) => typeof v !== "string")) return false;
  const want = createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${kunciServer()}`).digest("hex");
  const got = String(n.signature_key);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
