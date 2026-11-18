import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://USER:PASSWORD@localhost:5432/tabulin_test";
process.env.DATABASE_URL = URL;
process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-test";

type App = typeof import("@/lib/services/app");
type Gateway = typeof import("@/lib/services/gateway");
let app: App, gw: Gateway, db: Client, admin: number, tagihan: string, nominal: number;
const pasien = (no_rm: string) => ({ no_rm, nama: `Pasien ${no_rm}`, no_hp: "081200000001" });
const galat = async (p: Promise<unknown>) => p.then(() => null, async (e) => (await import("@/lib/api")).toApiError(e));

function sign(order_id: string, status_code: string, gross_amount: string) {
  return createHash("sha512").update(`${order_id}${status_code}${gross_amount}SB-Mid-server-test`).digest("hex");
}
const notif = (order_id: string, o: Record<string, string> = {}) => {
  const gross_amount = o.gross_amount ?? `${nominal}.00`;
  return { order_id, status_code: "200", gross_amount, transaction_status: "settlement", transaction_id: "mid-1", signature_key: sign(order_id, "200", gross_amount), ...o };
};
const saldo = async () => Number((await db.query("SELECT coalesce(sum(nominal_transaksi),0) AS s FROM transaksi")).rows[0].s);

function mockCharge(body: object = { status_code: "201", transaction_id: "mid-1", va_numbers: [{ bank: "bca", va_number: "11111222223333" }] }) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new globalThis.URL(URL).hostname)) throw new Error("tests only run against a local database");
  db = new Client({ connectionString: URL });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  admin = (await db.query("INSERT INTO pengguna_admin (email,nama,peran,password_hash) VALUES ('a@x','A','keuangan','x') RETURNING id")).rows[0].id;
  for (const rm of ["RM-1", "RM-2"]) await db.query("INSERT INTO pasien (no_rm,nama,no_hp) VALUES ($1,$2,'081200000001')", [rm, `Pasien ${rm}`]);
  app = await import("@/lib/services/app");
  gw = await import("@/lib/services/gateway");
  const tab = await import("@/lib/services/tabungan");
  const hpht = tab.addDays((await db.query("SELECT today_jkt()::text AS d")).rows[0].d, -70);
  const e = await app.daftarApp(pasien("RM-1"), {
    kode_faskes: "BDG", kode_cara_persalinan: "partus_normal", kode_kelas_kamar: "kelas_1", hpht, no_hp: "081200000001",
    persetujuan_disetujui: true, versi_persetujuan: "v1", jenis_rencana: "minimum",
  }, null);
  await db.query("SELECT setujui_pendaftaran($1,$2)", [e.id_pendaftaran, admin]);
  await db.query("SELECT pasang_va($1,'8800000000000001',$2)", [e.id_pendaftaran, admin]);
  const g = (await db.query("SELECT nomor, nominal FROM tagihan WHERE pendaftaran_id = $1 AND jenis = 'dp'", [e.id_pendaftaran])).rows[0];
  tagihan = g.nomor;
  nominal = Number(g.nominal);
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db.end();
});

describe("checkout (Midtrans Sandbox VA)", () => {
  it("creates a charge for the patient's own unpaid bill and stores it as menunggu", async () => {
    const f = mockCharge();
    const r = await gw.checkoutTagihan(pasien("RM-1"), tagihan, { bank: "bca" });
    expect(r).toMatchObject({ id_tagihan: tagihan, nominal, bank: "bca", nomor_va: "11111222223333", status: "menunggu" });
    expect(f).toHaveBeenCalledOnce();
    expect(String(f.mock.calls[0][0])).toContain("api.sandbox.midtrans.com");
    expect(JSON.parse(String(f.mock.calls[0][1]?.body)).transaction_details.gross_amount).toBe(nominal);
    expect((await db.query("SELECT status FROM pembayaran_gateway WHERE order_id = $1", [r.id_pembayaran])).rows[0].status).toBe("menunggu");
    expect(await saldo()).toBe(0);
  });

  it("refuses another patient's bill, an unknown bank and a gateway failure", async () => {
    mockCharge();
    expect(await galat(gw.checkoutTagihan(pasien("RM-2"), tagihan, {}))).toMatchObject({ status: 404 });
    expect(await galat(gw.checkoutTagihan(pasien("RM-1"), tagihan, { bank: "xyz" }))).toMatchObject({ status: 422 });
    vi.restoreAllMocks();
    mockCharge({ status_code: "400", status_message: "denied" });
    expect(await galat(gw.checkoutTagihan(pasien("RM-1"), tagihan, {}))).toMatchObject({ status: 502, code: "GATEWAY_GAGAL" });
  });
});

describe("notification (callback)", () => {
  let order: string;
  beforeAll(async () => {
    mockCharge();
    order = (await gw.checkoutTagihan(pasien("RM-1"), tagihan, {})).id_pembayaran;
  });

  it("refuses a bad signature, an unknown order and a wrong amount without crediting", async () => {
    expect(await galat(gw.terimaNotifikasiMidtrans({ ...notif(order), signature_key: "salah" }))).toMatchObject({ status: 401 });
    expect(await galat(gw.terimaNotifikasiMidtrans(notif("INV-X-tidak-ada")))).toMatchObject({ status: 404 });
    expect(await galat(gw.terimaNotifikasiMidtrans(notif(order, { gross_amount: "1000.00", signature_key: sign(order, "200", "1000.00") })))).toMatchObject({ status: 422, code: "NOMINAL_TIDAK_SESUAI" });
    expect(await saldo()).toBe(0);
    // each refusal leaves a trace in Log Setoran API
    const kode = (await db.query("SELECT kode_galat FROM log_setoran_api WHERE referensi IN ($1,'INV-X-tidak-ada') ORDER BY id", [order])).rows.map((x) => x.kode_galat);
    expect(kode).toEqual(["TANDA_TANGAN_TIDAK_VALID", "PESANAN_TIDAK_DIKENAL", "NOMINAL_TIDAK_SESUAI"]);
  });

  it("keeps the order waiting on a pending notification", async () => {
    expect(await gw.terimaNotifikasiMidtrans(notif(order, { transaction_status: "pending", status_code: "201", signature_key: sign(order, "201", `${nominal}.00`) }))).toMatchObject({ status: "menunggu" });
    expect(await saldo()).toBe(0);
  });

  it("settlement credits the balance, pays the bill and logs; a repeat does not credit twice", async () => {
    const r = await gw.terimaNotifikasiMidtrans(notif(order));
    expect(r).toMatchObject({ status: "berhasil", nomor_transaksi: expect.stringMatching(/^TRX-/) });
    expect(await saldo()).toBe(nominal);
    expect((await db.query("SELECT status FROM tagihan WHERE nomor = $1", [tagihan])).rows[0].status).toBe("lunas");
    expect((await db.query("SELECT sumber FROM transaksi WHERE ref_eksternal = $1", [order])).rows[0].sumber).toBe("api");
    await gw.terimaNotifikasiMidtrans(notif(order));
    expect(await saldo()).toBe(nominal);
    expect((await db.query("SELECT hasil FROM log_setoran_api WHERE referensi = $1 ORDER BY id", [order])).rows.map((x) => x.hasil)).toEqual(["ditolak", "ditolak", "diterima", "duplikat"]); // the first two are the earlier bad-signature and wrong-amount refusals
    expect((await db.query("SELECT status FROM pembayaran_gateway WHERE order_id = $1", [order])).rows[0].status).toBe("berhasil");
  });

  it("refuses checkout for a bill that is already paid", async () => {
    expect(await galat(gw.checkoutTagihan(pasien("RM-1"), tagihan, {}))).toMatchObject({ status: 409, code: "TAGIHAN_SUDAH_LUNAS" });
  });
});
