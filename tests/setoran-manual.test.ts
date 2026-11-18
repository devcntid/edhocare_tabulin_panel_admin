import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://USER:PASSWORD@localhost:5432/tabulin_test";
process.env.DATABASE_URL = URL;

type Pend = typeof import("@/lib/services/pendaftaran");
let svc: Pend, db: Client, admin: number, pid: number, pidLain: number, tagihan: { id: number; nomor: string; nominal: number }, kemarin: string, hariIni: string;
const pasien = (no_rm: string) => ({ no_rm, nama: `Pasien ${no_rm}`, no_hp: "081200000001" });
const galat = async (p: Promise<unknown>) => p.then(() => null, async (e) => (await import("@/lib/api")).toApiError(e));
const saldo = async (id: number) => Number((await db.query("SELECT saldo FROM v_saldo WHERE pendaftaran_id = $1", [id])).rows[0].saldo);

async function aktifkan(rm: string, va: string) {
  const app = await import("@/lib/services/app");
  const tab = await import("@/lib/services/tabungan");
  const e = await app.daftarApp(pasien(rm), {
    kode_faskes: "BDG", kode_cara_persalinan: "partus_normal", kode_kelas_kamar: "kelas_1", hpht: tab.addDays(hariIni, -70), no_hp: "081200000001",
    persetujuan_disetujui: true, versi_persetujuan: "v1", jenis_rencana: "minimum",
  }, null);
  await db.query("SELECT setujui_pendaftaran($1,$2)", [e.id_pendaftaran, admin]);
  await db.query("SELECT pasang_va($1,$2,$3)", [e.id_pendaftaran, va, admin]);
  return Number(e.id_pendaftaran);
}

beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new globalThis.URL(URL).hostname)) throw new Error("tests only run against a local database");
  db = new Client({ connectionString: URL });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  admin = Number((await db.query("INSERT INTO pengguna_admin (email,nama,peran,password_hash) VALUES ('a@x','A','keuangan','x') RETURNING id")).rows[0].id);
  for (const rm of ["RM-1", "RM-2"]) await db.query("INSERT INTO pasien (no_rm,nama,no_hp) VALUES ($1,$2,'081200000001')", [rm, `Pasien ${rm}`]);
  svc = await import("@/lib/services/pendaftaran");
  hariIni = (await db.query("SELECT today_jkt()::text AS d")).rows[0].d;
  kemarin = (await import("@/lib/services/tabungan")).addDays(hariIni, -1);
  pid = await aktifkan("RM-1", "8800000000000001");
  pidLain = await aktifkan("RM-2", "8800000000000002");
  const g = (await db.query("SELECT id, nomor, nominal FROM tagihan WHERE pendaftaran_id = $1 AND jenis = 'dp'", [pid])).rows[0];
  tagihan = { id: Number(g.id), nomor: g.nomor, nominal: Number(g.nominal) };
});

afterAll(async () => {
  await db.end();
});

describe("manual deposit confirmation (finance)", () => {
  it("validates the body before touching the database", async () => {
    expect(await galat(svc.konfirmasiSetoranManual(pid, { tanggal_bayar: "01-01-2026", nominal: "abc" }, admin))).toMatchObject({
      status: 422, fields: { tanggal_bayar: expect.any(String), nominal: expect.any(String) },
    });
    expect(await galat(svc.konfirmasiSetoranManual(pid, { tanggal_bayar: kemarin, nominal: 0 }, admin))).toMatchObject({ status: 422 });
  });

  it("refuses today's date (H+1), an under-payment and another registration's bill, without changing the balance", async () => {
    expect(await galat(svc.konfirmasiSetoranManual(pid, { tanggal_bayar: hariIni, nominal: tagihan.nominal, tagihan_id: tagihan.id }, admin))).toMatchObject({ code: "TANGGAL_TIDAK_VALID" });
    expect(await galat(svc.konfirmasiSetoranManual(pid, { tanggal_bayar: kemarin, nominal: tagihan.nominal - 1, tagihan_id: tagihan.id }, admin))).toMatchObject({ code: "NOMINAL_KURANG" });
    expect(await galat(svc.konfirmasiSetoranManual(pidLain, { tanggal_bayar: kemarin, nominal: tagihan.nominal, tagihan_id: tagihan.id }, admin))).toMatchObject({ status: 404 });
    expect(await saldo(pid)).toBe(0);
  });

  it("confirms a transfer: balance up, bill paid, ledger row by the admin, notification and audit", async () => {
    const t = await svc.konfirmasiSetoranManual(pid, { tanggal_bayar: kemarin, nominal: tagihan.nominal, tagihan_id: tagihan.id }, admin);
    expect(t.jenis).toBe("DP");
    expect([Number(t.tagihan_id), Number(t.dikonfirmasi_oleh)]).toEqual([tagihan.id, admin]);
    expect(await saldo(pid)).toBe(tagihan.nominal);
    expect((await db.query("SELECT status, ref_transaksi FROM tagihan WHERE id = $1", [tagihan.id])).rows[0]).toMatchObject({ status: "lunas", ref_transaksi: t.nomor });
    expect((await db.query("SELECT count(*)::int AS n FROM notifikasi WHERE pendaftaran_id = $1 AND templat_kode = 'pembayaran_terkonfirmasi'", [pid])).rows[0].n).toBe(1);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE aksi = 'konfirmasi_setoran' AND entitas_id = $1", [t.id])).rows[0].n).toBe(1);
  });

  it("refuses a bill that is already paid, and records a deposit without a bill as an extra deposit", async () => {
    expect(await galat(svc.konfirmasiSetoranManual(pid, { tanggal_bayar: kemarin, nominal: tagihan.nominal, tagihan_id: tagihan.id }, admin))).toMatchObject({ code: "TAGIHAN_SUDAH_LUNAS", status: 409 });
    const antes = await saldo(pid);
    const t = await svc.konfirmasiSetoranManual(pid, { tanggal_bayar: kemarin, nominal: 500_000 }, admin);
    expect(t.jenis).toBe("Setoran tambahan");
    expect(await saldo(pid)).toBe(antes + 500_000);
  });
});
