import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://alif@localhost:5432/tabulin_test";
process.env.DATABASE_URL = URL; // lib/db reads this when first imported (below, after the schema exists)

type Svc = typeof import("@/lib/services/app");
type Tab = typeof import("@/lib/services/tabungan");
let svc: Svc, tab: Tab, db: Client, admin: number, hpht: string;
const pasien = (no_rm: string) => ({ no_rm, nama: `Pasien ${no_rm}`, no_hp: "081200000001" });
const body = (o: object = {}) => ({
  kode_faskes: "BDG", kode_cara_persalinan: "partus_normal", kode_kelas_kamar: "kelas_1", hpht, no_hp: "081200000001",
  persetujuan_disetujui: true, versi_persetujuan: "v1", jenis_rencana: "minimum", ...o,
});
// What the HTTP layer would answer: services throw ApiError or ZodError, appHandler maps both through toApiError.
const galat = async (p: Promise<unknown>) => p.then(() => null, async (e) => (await import("@/lib/api")).toApiError(e));

beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new globalThis.URL(URL).hostname)) throw new Error("tests only run against a local database");
  db = new Client({ connectionString: URL });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  admin = (await db.query("INSERT INTO pengguna_admin (email,nama,peran,password_hash) VALUES ('a@x','A','keuangan','x') RETURNING id")).rows[0].id;
  for (const rm of ["RM-1", "RM-2", "RM-3", "RM-4"]) await db.query("INSERT INTO pasien (no_rm,nama,no_hp) VALUES ($1,$2,'081200000001')", [rm, `Pasien ${rm}`]);
  svc = await import("@/lib/services/app");
  tab = await import("@/lib/services/tabungan");
  hpht = tab.addDays((await db.query("SELECT today_jkt()::text AS d")).rows[0].d, -70);
});

afterAll(async () => {
  await db.end();
});

describe("enrollment (E-04, E-05)", () => {
  it("is belum_terdaftar before registering", async () => {
    expect(await svc.pendaftaranSaya(pasien("RM-1"))).toMatchObject({ status_pendaftaran: "belum_terdaftar", profil: { no_rm: "RM-1" } });
  });

  it("registers with a package snapshot and returns the same enrollment for the same Idempotency-Key", async () => {
    const a = await svc.daftarApp(pasien("RM-1"), body(), "kunci-pertama-1");
    expect(a).toMatchObject({ status_pendaftaran: "menunggu_verifikasi", tarif_total: 15_000_000, dp: 3_000_000, target_50: 7_500_000, tier: "essential", kode_kelas_kamar: "kelas_1" });
    const b = await svc.daftarApp(pasien("RM-1"), body(), "kunci-pertama-1");
    expect(b.id_pendaftaran).toBe(a.id_pendaftaran);
    expect((await db.query("SELECT count(*)::int AS n FROM pendaftaran WHERE no_rm = 'RM-1'")).rows[0].n).toBe(1);
  });

  it("refuses a second live enrollment with PENDAFTARAN_SUDAH_ADA", async () => {
    expect(await galat(svc.daftarApp(pasien("RM-1"), body(), "kunci-kedua-22"))).toMatchObject({ status: 409, code: "PENDAFTARAN_SUDAH_ADA" });
  });

  it("validates consent, HPHT, package choice and consent version", async () => {
    expect(await galat(svc.daftarApp(pasien("RM-2"), body({ persetujuan_disetujui: false }), null))).toMatchObject({ status: 422, fields: { persetujuan_disetujui: expect.any(String) } });
    expect(await galat(svc.daftarApp(pasien("RM-2"), body({ hpht: "2999-01-01" }), null))).toMatchObject({ status: 422, fields: { hpht: expect.any(String) } });
    expect(await galat(svc.daftarApp(pasien("RM-2"), body({ kode_kelas_kamar: "tidak_ada" }), null))).toMatchObject({ status: 422, fields: { kode_kelas_kamar: expect.any(String) } });
    expect(await galat(svc.daftarApp(pasien("RM-2"), body({ versi_persetujuan: "v0" }), null))).toMatchObject({ status: 409, code: "VERSI_PERSETUJUAN_BERUBAH" });
    expect((await db.query("SELECT count(*)::int AS n FROM pendaftaran WHERE no_rm = 'RM-2'")).rows[0].n).toBe(0);
  });

  it("shows the registration without balance fields while it is pending", async () => {
    const me = await svc.pendaftaranSaya(pasien("RM-1"));
    expect(me).toMatchObject({ status_pendaftaran: "menunggu_verifikasi", no_pendaftaran: expect.stringMatching(/^TBL-/) });
    expect(me).not.toHaveProperty("saldo");
  });
});

describe("active enrollment: bills, ledger, notifications (E-05 to E-12)", () => {
  const p = pasien("RM-3");
  let pid: number;
  beforeAll(async () => {
    pid = Number((await svc.daftarApp(p, body(), null)).id_pendaftaran);
    await db.query("SELECT setujui_pendaftaran($1,$2)", [pid, admin]);
    await db.query("SELECT pasang_va($1,'8800000000000003',$2)", [pid, admin]); // issues the DP bill
    const hari = (await db.query("SELECT today_jkt()::text AS d")).rows[0].d;
    const dp = (await db.query("SELECT nomor FROM tagihan WHERE pendaftaran_id = $1 AND jenis = 'dp'", [pid])).rows[0].nomor;
    await db.query("SELECT * FROM terima_setoran_api('8800000000000003','REF-APP-1',$1,3000000,$2)", [hari, dp]); // without a bill number the API books an extra deposit
  });

  it("returns balance, status and the next bill", async () => {
    expect(await svc.pendaftaranSaya(p)).toMatchObject({
      status_pendaftaran: "aktif", no_va: "8800000000000003", saldo: 3_000_000, progres_ke_50: 40, status_tabungan: "sesuai_jalur",
    });
  });

  it("lists bills with a cursor and filters by group", async () => {
    const semua = await svc.tagihanList(p, new globalThis.URL("http://x/bills"), { limit: 20, offset: 0 });
    const dp = semua.find((t) => t.jenis_tagihan === "dp")!;
    expect(dp).toMatchObject({ status_tagihan: "lunas", nominal_tagihan: 3_000_000 });
    expect(await svc.tagihanList(p, new globalThis.URL("http://x/bills"), { limit: 1, offset: 0 })).toHaveLength(1);
    const aktif = await svc.tagihanList(p, new globalThis.URL("http://x/bills?kelompok=aktif"), { limit: 20, offset: 0 });
    expect(aktif.every((t) => t.status_tagihan !== "lunas")).toBe(true);
    expect(await svc.tagihanDetail(p, dp.id_tagihan)).toMatchObject({ no_tagihan: dp.no_tagihan });
  });

  it("hides other patients' bills behind NOT_FOUND", async () => {
    const dp = (await svc.tagihanList(p, new globalThis.URL("http://x/bills"), { limit: 20, offset: 0 })).find((t) => t.jenis_tagihan === "dp")!;
    expect(await galat(svc.tagihanDetail(pasien("RM-1"), dp.id_tagihan))).toMatchObject({ status: 404 });
  });

  it("lists the confirmed ledger with the contract's transaction types", async () => {
    const l = await svc.ledger(p, new globalThis.URL("http://x/ledger?jenis_transaksi=dp"), { limit: 20, offset: 0 });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ jenis_transaksi: "dp", nominal_transaksi: 3_000_000, saldo_setelah: 3_000_000, status_transaksi: "terkonfirmasi" });
    expect(await svc.ledger(p, new globalThis.URL("http://x/ledger?jenis_transaksi=koreksi"), { limit: 20, offset: 0 })).toHaveLength(0);
    expect(await galat(svc.ledger(p, new globalThis.URL("http://x/ledger?jenis_transaksi=ngawur"), { limit: 20, offset: 0 }))).toMatchObject({ status: 422 });
  });

  it("marks notifications read, one id then all, ignoring unknown and foreign ids", async () => {
    const { rows, belumDibaca } = await svc.notifikasiList(p, { limit: 20, offset: 0 });
    expect(belumDibaca).toBeGreaterThan(1);
    const r = await svc.tandaiDibaca(p, { id_notifikasi: [rows[0].id_notifikasi, "999999", "bukan-angka"] });
    expect(r.jumlah_notifikasi_belum_dibaca).toBe(belumDibaca - 1);
    expect(await svc.tandaiDibaca(pasien("RM-1"), { semua: true })).toEqual({ jumlah_notifikasi_belum_dibaca: 0 });
    expect((await svc.notifikasiList(p, { limit: 20, offset: 0 })).belumDibaca).toBe(belumDibaca - 1);
    expect((await svc.tandaiDibaca(p, { semua: true })).jumlah_notifikasi_belum_dibaca).toBe(0);
  });
});

describe("devices (E-10, E-14)", () => {
  const dev = { token_fcm: "fcm:abc", platform: "android", id_perangkat: "inst-1", versi_aplikasi: "1.0.0" };
  it("upserts per id_perangkat, reassigns it on another patient's login, and deletes only its owner's", async () => {
    await svc.daftarPerangkat(pasien("RM-4"), dev);
    await svc.daftarPerangkat(pasien("RM-4"), { ...dev, token_fcm: "fcm:baru" });
    expect((await db.query("SELECT token_fcm FROM perangkat WHERE id_perangkat = 'inst-1'")).rows).toEqual([{ token_fcm: "fcm:baru" }]);
    await svc.hapusPerangkat(pasien("RM-1"), "inst-1");
    expect((await db.query("SELECT 1 FROM perangkat WHERE id_perangkat = 'inst-1'")).rowCount).toBe(1);
    await svc.daftarPerangkat(pasien("RM-1"), dev);
    expect((await db.query("SELECT no_rm FROM perangkat WHERE id_perangkat = 'inst-1'")).rows).toEqual([{ no_rm: "RM-1" }]);
    await svc.hapusPerangkat(pasien("RM-1"), "inst-1");
    expect((await db.query("SELECT 1 FROM perangkat WHERE id_perangkat = 'inst-1'")).rowCount).toBe(0);
  });
  it("rejects an unknown platform", async () => {
    expect(await galat(svc.daftarPerangkat(pasien("RM-4"), { ...dev, platform: "windows" }))).toMatchObject({ status: 422, fields: { platform: expect.any(String) } });
  });
});

describe("catalog (E-01, E-02, E-03)", () => {
  it("lists faskes x cara x kelas packages with contract codes and the payment channel instructions", async () => {
    const k = await svc.paketKatalog();
    expect(k.paket).toHaveLength(2 * 3 * 8);
    expect(k.paket.find((p) => p.kode_faskes === "BDG" && p.kode_cara_persalinan === "partus_normal" && p.kode_kelas_kamar === "kelas_1")).toMatchObject({ tarif_total: 15_000_000, dp: 3_000_000, tier: "essential" });
    expect((await svc.paketKatalog("CJR")).paket.every((p) => p.kode_faskes === "CJR")).toBe(true);
    expect(k.cara_persalinan.map((c) => c.kode_cara_persalinan)).toContain("caesar_eracs");
    const pr = await svc.program();
    expect(pr.kanal_pembayaran[0]).toMatchObject({ kode_kanal: "bca_va", langkah_kanal: [expect.any(String)] });
    expect(pr.konfigurasi).toMatchObject({ persen_dp: 20, persen_target: 50, minggu_milestone: 28, setoran_min_terendah: 1_000_000 });
  });
  it("simulates server-side and validates the choice", async () => {
    const s = await svc.simulasiApp({ kode_faskes: "BDG", kode_cara_persalinan: "caesar_konvensional", kode_kelas_kamar: "vip_a", hpht });
    expect(s).toMatchObject({ tarif_total: 49_000_000, dp: 9_800_000, target_50: 24_500_000, usia_kehamilan_minggu: 10, nama_tier: "Saving+ Premium" });
    expect(await galat(svc.simulasiApp({ kode_faskes: "XXX", hpht }))).toMatchObject({ status: 422, fields: { kode_cara_persalinan: expect.any(String), kode_kelas_kamar: expect.any(String) } });
  });
});
