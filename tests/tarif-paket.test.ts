import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://USER:PASSWORD@localhost:5432/tabulin_test";
process.env.DATABASE_URL = URL;

type Master = typeof import("@/lib/services/master");
let db: Client, m: Master, pool: (typeof import("@/lib/db"))["pool"];
let caraId: number, kelasId: number, faskes: number[];
const galat = async (p: Promise<unknown>) => p.then(() => null, async (e) => (await import("@/lib/api")).toApiError(e));

/** Run `fn` in a transaction like the API route does; roll back on error. */
async function tx<T>(fn: (c: import("pg").PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const tarif = async (cara: number, kelas: number, f: number) => {
  const r = (await m.daftarTarifPaket()).find((t) => t.cara_id === cara && t.kelas_id === kelas)!;
  return { tarif: r.tarif[f], eksplisit: r.eksplisit[f] };
};

beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new globalThis.URL(URL).hostname)) throw new Error("tests only run against a local database");
  db = new Client({ connectionString: URL });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  m = await import("@/lib/services/master");
  pool = (await import("@/lib/db")).pool;
  faskes = (await db.query("SELECT id FROM faskes WHERE aktif ORDER BY id")).rows.map((r) => Number(r.id));
  caraId = Number((await db.query("SELECT id FROM opsi_cara_persalinan WHERE nama = 'Partus Normal'")).rows[0].id);
  kelasId = Number((await db.query("SELECT id FROM opsi_kelas_kamar WHERE nama = 'Kelas 1'")).rows[0].id);
});

afterAll(async () => {
  await db.end();
});

describe("tarif paket (cara x kelas per faskes)", () => {
  it("lists every combination with its effective tariff and source", async () => {
    const d = await m.daftarTarifPaket();
    expect(d).toHaveLength(24);
    const t = d.find((x) => x.cara_id === caraId && x.kelas_id === kelasId)!;
    for (const f of faskes) {
      expect(t.tarif[f]).toBe(15_000_000);
      expect(t.eksplisit[f]).toBe(true);
    }
  });

  it("an explicit tariff changes what the app catalogue shows", async () => {
    await tx((c) => m.simpanTarifPaket(c, caraId, kelasId, Object.fromEntries(faskes.map((f) => [String(f), 16_000_000]))));
    expect(await tarif(caraId, kelasId, faskes[0])).toEqual({ tarif: 16_000_000, eksplisit: true });
    const app = await import("@/lib/services/app");
    const p = (await app.paketKatalog("BDG")).paket.find((x) => x.kode_cara_persalinan === "partus_normal" && x.kode_kelas_kamar === "kelas_1")!;
    expect(p.tarif_total).toBe(16_000_000);
    expect(p.dp).toBe(3_200_000);
  });

  it("can set a different tariff per faskes", async () => {
    await tx((c) => m.simpanTarifPaket(c, caraId, kelasId, { [String(faskes[0])]: 17_000_000, [String(faskes[1])]: 18_000_000 }));
    expect((await tarif(caraId, kelasId, faskes[0])).tarif).toBe(17_000_000);
    expect((await tarif(caraId, kelasId, faskes[1])).tarif).toBe(18_000_000);
  });

  it("rejects missing or non-positive tariffs and changes nothing", async () => {
    const e = await galat(tx((c) => m.simpanTarifPaket(c, caraId, kelasId, { [String(faskes[0])]: 1_000_000, [String(faskes[1])]: 0 })));
    expect(e?.status).toBe(422);
    expect(e?.fields).toHaveProperty(`harga_${faskes[1]}`);
    expect((await tarif(caraId, kelasId, faskes[0])).tarif).toBe(17_000_000);
    expect((await galat(tx((c) => m.simpanTarifPaket(c, caraId, kelasId, {}))))?.status).toBe(422);
  });

  it("returns 404 for an unknown cara or kelas", async () => {
    expect((await galat(tx((c) => m.simpanTarifPaket(c, 99999, kelasId, { [String(faskes[0])]: 1 }))))?.status).toBe(404);
  });

  it("clearing falls back to cara price + kelas price", async () => {
    await tx((c) => m.simpanTarifPaket(c, caraId, kelasId, null));
    const hc = Number((await db.query("SELECT harga FROM harga_cara WHERE cara_id = $1 AND faskes_id = $2", [caraId, faskes[0]])).rows[0].harga);
    const hk = Number((await db.query("SELECT harga FROM harga_kelas WHERE kelas_id = $1 AND faskes_id = $2", [kelasId, faskes[0]])).rows[0].harga);
    expect(await tarif(caraId, kelasId, faskes[0])).toEqual({ tarif: hc + hk, eksplisit: false });
  });

  it("refuses to clear when cara or kelas prices are missing, and rolls back", async () => {
    const cara = Number((await db.query("INSERT INTO opsi_cara_persalinan (nama) VALUES ('Cara Uji') RETURNING id")).rows[0].id);
    await tx((c) => m.simpanTarifPaket(c, cara, kelasId, Object.fromEntries(faskes.map((f) => [String(f), 20_000_000]))));
    const e = await galat(tx((c) => m.simpanTarifPaket(c, cara, kelasId, null)));
    expect(e?.status).toBe(422);
    expect((await tarif(cara, kelasId, faskes[0])).tarif).toBe(20_000_000);
  });

  it("does not change the tariff of an existing registration", async () => {
    await db.query("INSERT INTO pasien (no_rm,nama,no_hp) VALUES ('RM-T1','Pasien T1','081200000001')");
    const app = await import("@/lib/services/app");
    const tab = await import("@/lib/services/tabungan");
    const hariIni = (await db.query("SELECT today_jkt()::text AS d")).rows[0].d;
    await tx((c) => m.simpanTarifPaket(c, caraId, kelasId, Object.fromEntries(faskes.map((f) => [String(f), 16_000_000]))));
    const e = await app.daftarApp({ no_rm: "RM-T1", nama: "Pasien T1", no_hp: "081200000001" }, {
      kode_faskes: "BDG", kode_cara_persalinan: "partus_normal", kode_kelas_kamar: "kelas_1", hpht: tab.addDays(hariIni, -70), no_hp: "081200000001",
      persetujuan_disetujui: true, versi_persetujuan: "v1", jenis_rencana: "minimum",
    }, null);
    await tx((c) => m.simpanTarifPaket(c, caraId, kelasId, Object.fromEntries(faskes.map((f) => [String(f), 19_000_000]))));
    const t = Number((await db.query("SELECT tarif_total FROM pendaftaran WHERE id = $1", [e.id_pendaftaran])).rows[0].tarif_total);
    expect(t).toBe(16_000_000);
  });
});
