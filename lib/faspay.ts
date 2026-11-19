import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api";

// Faspay through the payment gateway orchestrator (pay-gate). OAuth client credentials give a 10 minute bearer token.
// The gateway tells us about payments with signed webhooks, but the webhook is only a hint: the transaction is read back with our own token.
const BASE = () => (process.env.FASPAY_BASE_URL ?? "https://pay-gate-orpin.vercel.app").replace(/\/+$/, "");
export const METODE_GATEWAY = ["VA", "QRIS", "EWALLET", "RETAIL"] as const;
export type MetodeGateway = (typeof METODE_GATEWAY)[number];

const gagal = () => new ApiError(502, "GATEWAY_GAGAL", "Gateway pembayaran tidak dapat dihubungi.");

let cache: { token: string; habis: number } | null = null;

/** Bearer token, cached until 30 seconds before it expires. */
async function token(): Promise<string> {
  if (cache && Date.now() < cache.habis - 30_000) return cache.token;
  const id = process.env.FASPAY_CLIENT_ID, secret = process.env.FASPAY_CLIENT_SECRET;
  if (!id || !secret) throw new ApiError(503, "TIDAK_DIKONFIGURASI", "Pembayaran gateway belum dikonfigurasi.");
  const res = await fetch(`${BASE()}/v1/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw gagal(); });
  const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !j?.access_token) throw new ApiError(502, "GATEWAY_GAGAL", "Gateway pembayaran menolak kredensial.");
  cache = { token: j.access_token, habis: Date.now() + (j.expires_in ?? 600) * 1000 };
  return cache.token;
}
export const lupakanToken = () => { cache = null; };

export type TransaksiGateway = {
  transaction_id: string; merchant_reference?: string; status: string; amount?: number;
  provider_reference?: string | null; payment_instruction?: Record<string, unknown> | null; expires_at?: string | null;
};

async function panggil(path: string, init: RequestInit & { ulang?: boolean } = {}): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${BASE()}${path}`, { ...init, headers: { Accept: "application/json", ...init.headers, Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(30_000) }).catch(() => { throw gagal(); });
  if (res.status === 401 && !init.ulang) { lupakanToken(); return panggil(path, { ...init, ulang: true }); } // token revoked early: one retry with a new one
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

/** Creates a transaction at the gateway under our own reference (`merchant_reference`). */
export async function buatTransaksi(o: { referensi: string; nominal: number; metode: MetodeGateway; kanal: string; deskripsi: string }): Promise<TransaksiGateway> {
  const r = await panggil("/v1/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ merchant_reference: o.referensi, amount: o.nominal, currency: "IDR", payment_method: o.metode, channel_code: o.kanal, description: o.deskripsi.slice(0, 255) }),
  });
  const err = (r.json?.error ?? null) as { code?: string } | null;
  if (err?.code === "ROUTE_NOT_AUTHORIZED") throw new ApiError(409, "KANAL_TIDAK_TERSEDIA", "Metode pembayaran ini belum tersedia.");
  const t = r.json as TransaksiGateway | null;
  // 201 created, 200 idempotent replay, 202 outcome unknown (the webhook or a later read settles it).
  if (![200, 201, 202].includes(r.status) || !t?.transaction_id) throw new ApiError(502, "GATEWAY_GAGAL", "Gateway pembayaran menolak permintaan.");
  return t;
}

/** Authoritative state of a transaction, asked with our own token. Null when the gateway does not know it. */
export async function ambilTransaksi(transactionId: string): Promise<TransaksiGateway | null> {
  const r = await panggil(`/v1/transactions/${encodeURIComponent(transactionId)}`);
  if (r.status === 404) return null;
  const t = r.json as TransaksiGateway | null;
  if (r.status !== 200 || !t?.transaction_id || typeof t.status !== "string") throw new ApiError(502, "GATEWAY_GAGAL", "Respons gateway tidak lengkap.");
  return t;
}

/** Gateway status -> our payment status. Anything not final stays "menunggu". */
export function statusLokal(s: string): "berhasil" | "gagal" | "kedaluwarsa" | "menunggu" {
  const v = s.toUpperCase();
  return v === "SUCCEEDED" ? "berhasil" : v === "FAILED" ? "gagal" : v === "EXPIRED" || v === "CANCELLED" ? "kedaluwarsa" : "menunggu";
}

const TOLERANSI_DETIK = 300;

/**
 * Checks `X-Gateway-Signature` = "v1=" + hex HMAC-SHA256(secret, timestamp + "." + body) and that the timestamp is recent.
 * The body must be the raw text as received (the gateway signs the minified JSON it sends).
 */
export function verifikasiWebhook(isi: string, timestamp: string | null, tandatangan: string | null, secret: string, sekarang = Date.now()): boolean {
  if (!timestamp || !tandatangan) return false;
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(sekarang / 1000 - t) > TOLERANSI_DETIK) return false;
  const harapan = `v1=${createHmac("sha256", secret).update(`${timestamp}.${isi}`).digest("hex")}`;
  const a = Buffer.from(harapan), b = Buffer.from(tandatangan);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const rahasiaWebhook = () => process.env.FASPAY_WEBHOOK_SECRET || null;
