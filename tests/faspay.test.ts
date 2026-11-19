import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://USER:PASSWORD@localhost:5432/tabulin_test";
process.env.DATABASE_URL = URL;
process.env.FASPAY_BASE_URL = "https://gateway.test";
process.env.FASPAY_CLIENT_ID = "cid";
process.env.FASPAY_CLIENT_SECRET = "csecret";
process.env.FASPAY_WEBHOOK_SECRET = "whsecret";

type Gateway = typeof import("@/lib/services/gateway");
type Faspay = typeof import("@/lib/faspay");
let gw: Gateway, fp: Faspay, db: Client, tagihan: string, nominal: number, kanalId: number;
const pasien = { no_rm: "RM-F1", nama: "Pasien RM-F1", no_hp: "081200000001" };
const galat = async (p: Promise<unknown>) => p.then(() => null, async (e) => (await import("@/lib/api")).toApiError(e));
const saldo = async () => Number((await db.query("SELECT coalesce(sum(nominal_transaksi),0) AS s FROM transaksi")).rows[0].s);

/** Signed like the gateway: v1=HMAC_SHA256(secret, timestamp + "." + body). */
function ttd(isi: string, ts = String(Math.floor(Date.now() / 1000)), secret = "whsecret") {
  return { ts, sig: `v1=${createHmac("sha256", secret).update(`${ts}.${isi}`).digest("hex")}` };
}
const webhook = (merchant_reference: string, transaction_id = "331") => JSON.stringify({ event_id: "evt-1", event_type: "transaction.succeeded", transaction: { transaction_id, merchant_reference, status: "SUCCEEDED" }, occurred_at: "2026-11-19T10:00:00+07:00" });

type Balasan = { status?: number; body: object };
/** Routes fetch by URL: token, create, read. A fresh Response per call (a body can be read once). */
function mockGateway(o: { create?: Balasan; baca?: Balasan } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const u = String(input);
    const r = (b: Balasan) => new Response(JSON.stringify(b.body), { status: b.status ?? 200 });
    if (u.endsWith("/v1/oauth/token")) return r({ body: { access_token: "tok", token_type: "Bearer", expires_in: 600, scope: "transactions:write" } });
    if (u.endsWith("/v1/transactions") && init?.method === "POST") return r(o.create ?? { status: 201, body: { transaction_id: "331", merchant_reference: "x", status: "PENDING", amount: 15000, provider_reference: "3535", payment_instruction: { type: "EWALLET", virtual_account_no: null, payment_code: null, qr_url: null, redirect_url: "https://pay.example/x", expires_at: "2099-01-01T00:00:00+07:00" }, expires_at: "2099-01-01T00:00:00+07:00" } });
    return r(o.baca ?? { body: { transaction_id: "331", status: "SUCCEEDED", amount: nominal } });
  });
}
const baca = (order: string, o: Record<string, unknown> = {}) => ({ body: { transaction_id: "331", merchant_reference: order, status: "SUCCEEDED", amount: nominal, ...o } });

beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new globalThis.URL(URL).hostname)) throw new Error("tests only run against a local database");
  db = new Client({ connectionString: URL });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  const admin = (await db.query("INSERT INTO pengguna_admin (email,nama,peran,password_hash) VALUES ('a@x','A','keuangan','x') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO pasien (no_rm,nama,no_hp) VALUES ($1,$2,'081200000001')", [pasien.no_rm, pasien.nama]);
  const app = await import("@/lib/services/app");
  gw = await import("@/lib/services/gateway");
  fp = await import("@/lib/faspay");
  const tab = await import("@/lib/services/tabungan");
  const hpht = tab.addDays((await db.query("SELECT today_jkt()::text AS d")).rows[0].d, -70);
  const e = await app.daftarApp(pasien, {
    kode_faskes: "BDG", kode_cara_persalinan: "partus_normal", kode_kelas_kamar: "kelas_1", hpht, no_hp: "081200000001",
    persetujuan_disetujui: true, versi_persetujuan: "v1", jenis_rencana: "minimum",
  }, null);
  await db.query("SELECT setujui_pendaftaran($1,$2)", [e.id_pendaftaran, admin]);
  await db.query("SELECT pasang_va($1,'8800000000000009',$2)", [e.id_pendaftaran, admin]);
  const g = (await db.query("SELECT nomor, nominal FROM tagihan WHERE pendaftaran_id = $1 AND jenis = 'dp'", [e.id_pendaftaran])).rows[0];
  tagihan = g.nomor;
  nominal = Number(g.nominal);
  await db.query("UPDATE kanal_pembayaran SET aktif = true WHERE kode IN ('ovo','shopeepay_qris')");
  kanalId = (await db.query("SELECT id FROM kanal_pembayaran WHERE kode = 'ovo'")).rows[0].id;
});
afterEach(() => { vi.restoreAllMocks(); fp.lupakanToken(); });
afterAll(async () => { await db.end(); });

describe("verifikasiWebhook", () => {
  it("accepts a correct, recent signature and refuses a wrong secret, a changed body, a stale timestamp and missing headers", () => {
    const isi = '{"a":1}';
    const { ts, sig } = ttd(isi);
    expect(fp.verifikasiWebhook(isi, ts, sig, "whsecret")).toBe(true);
    expect(fp.verifikasiWebhook(isi, ts, ttd(isi, ts, "other").sig, "whsecret")).toBe(false);
    expect(fp.verifikasiWebhook('{"a":2}', ts, sig, "whsecret")).toBe(false);
    const lama = String(Math.floor(Date.now() / 1000) - 3600);
    expect(fp.verifikasiWebhook(isi, lama, ttd(isi, lama).sig, "whsecret")).toBe(false);
    expect(fp.verifikasiWebhook(isi, null, sig, "whsecret")).toBe(false);
    expect(fp.verifikasiWebhook(isi, ts, null, "whsecret")).toBe(false);
  });
});

describe("kanal Faspay", () => {
  it("maps every gateway channel to a payment method, and BCA VA keeps its place", async () => {
    const r = (await db.query("SELECT kode, metode_gateway, konfigurasi->>'pg_code' AS pg FROM kanal_pembayaran WHERE konfigurasi ? 'pg_code'")).rows;
    expect(r).toHaveLength(21);
    expect(r.every((x) => x.metode_gateway)).toBe(true);
    expect(r.find((x) => x.kode === "bca_va")).toMatchObject({ pg: "702", metode_gateway: "VA" });
    expect(r.find((x) => x.kode === "ovo")).toMatchObject({ pg: "812", metode_gateway: "EWALLET" });
  });
});

describe("checkout Faspay", () => {
  it("creates a gateway transaction for the bill and keeps its payment instruction", async () => {
    const f = mockGateway();
    const r = await gw.checkoutTagihan(pasien, tagihan, { kanal: "ovo" });
    expect(r).toMatchObject({ id_tagihan: tagihan, nominal, kanal: "ovo", metode: "EWALLET", status: "menunggu", nomor_va: null, instruksi_pembayaran: { redirect_url: "https://pay.example/x" } });
    const buat = f.mock.calls.find((c) => String(c[0]).endsWith("/v1/transactions"))!;
    expect(JSON.parse(String(buat[1]?.body))).toMatchObject({ merchant_reference: r.id_pembayaran, amount: nominal, payment_method: "EWALLET", channel_code: "812", currency: "IDR" });
    expect((buat[1]?.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect((buat[1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect((await db.query("SELECT penyedia, status, kanal_id, id_transaksi_gateway FROM pembayaran_gateway WHERE order_id = $1", [r.id_pembayaran])).rows[0]).toMatchObject({ penyedia: "faspay", status: "menunggu", kanal_id: kanalId, id_transaksi_gateway: "331" });
    expect(await saldo()).toBe(0);
  });

  it("returns the same open payment again instead of creating a second one", async () => {
    const f = mockGateway();
    const r2 = await gw.checkoutTagihan(pasien, tagihan, { kanal: "ovo" });
    expect(f.mock.calls.filter((c) => String(c[0]).endsWith("/v1/transactions"))).toHaveLength(0);
    expect(r2.status).toBe("menunggu");
  });

  it("refuses an inactive or unmapped method and reports a route the gateway has not enabled", async () => {
    mockGateway();
    expect(await galat(gw.checkoutTagihan(pasien, tagihan, { kanal: "qris" }))).toMatchObject({ status: 404 });
    expect(await galat(gw.checkoutTagihan(pasien, tagihan, { kanal: "tidak_ada" }))).toMatchObject({ status: 404 });
    vi.restoreAllMocks();
    mockGateway({ create: { status: 403, body: { error: { code: "ROUTE_NOT_AUTHORIZED", message: "x" } } } });
    expect(await galat(gw.checkoutTagihan(pasien, tagihan, { kanal: "shopeepay_qris" }))).toMatchObject({ status: 409, code: "KANAL_TIDAK_TERSEDIA" });
  });
});

describe("webhook Faspay", () => {
  let order: string;
  it("rejects a bad signature and credits nothing", async () => {
    order = (await db.query("SELECT order_id FROM pembayaran_gateway WHERE penyedia = 'faspay' ORDER BY id LIMIT 1")).rows[0].order_id;
    const isi = webhook(order);
    expect(await galat(gw.terimaNotifikasiFaspay(isi, "1", "v1=salah"))).toMatchObject({ status: 401 });
    expect(await saldo()).toBe(0);
  });

  it("reads the transaction back, credits the ledger once, and ignores a redelivery", async () => {
    mockGateway({ baca: baca(order) });
    const isi = webhook(order);
    const { ts, sig } = ttd(isi);
    const r1 = await gw.terimaNotifikasiFaspay(isi, ts, sig);
    expect(r1).toMatchObject({ order_id: order, status: "berhasil" });
    expect(await saldo()).toBe(nominal);
    expect((await gw.terimaNotifikasiFaspay(isi, ts, sig))).toMatchObject({ status: "berhasil" });
    expect(await saldo()).toBe(nominal);
    expect((await db.query("SELECT status FROM tagihan WHERE nomor = $1", [tagihan])).rows[0].status).toBe("lunas");
  });

  it("does not believe the webhook: a transaction the gateway reports as not paid credits nothing", async () => {
    await db.query("UPDATE pembayaran_gateway SET status = 'menunggu' WHERE order_id = $1", [order]);
    const before = await saldo();
    mockGateway({ baca: baca(order, { status: "PENDING" }) });
    const isi = webhook(order);
    const { ts, sig } = ttd(isi);
    expect(await gw.terimaNotifikasiFaspay(isi, ts, sig)).toMatchObject({ status: "menunggu" });
    expect(await saldo()).toBe(before);
  });

  it("refuses a different amount and an unknown order, and logs the refusal", async () => {
    mockGateway({ baca: baca(order, { amount: nominal + 1 }) });
    let isi = webhook(order), t = ttd(isi);
    expect(await galat(gw.terimaNotifikasiFaspay(isi, t.ts, t.sig))).toMatchObject({ status: 422, code: "NOMINAL_TIDAK_SESUAI" });
    isi = webhook("TIDAK-ADA"); t = ttd(isi);
    expect(await galat(gw.terimaNotifikasiFaspay(isi, t.ts, t.sig))).toMatchObject({ status: 404 });
    expect((await db.query("SELECT count(*)::int AS n FROM log_setoran_api WHERE hasil = 'ditolak'")).rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it("marks a failed or expired transaction without crediting", async () => {
    mockGateway({ baca: baca(order, { status: "EXPIRED" }) });
    const isi = webhook(order), t = ttd(isi);
    const before = await saldo();
    expect(await gw.terimaNotifikasiFaspay(isi, t.ts, t.sig)).toMatchObject({ status: "kedaluwarsa" });
    expect(await saldo()).toBe(before);
  });
});
