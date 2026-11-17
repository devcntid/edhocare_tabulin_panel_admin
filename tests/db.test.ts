import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://USER:PASSWORD@localhost:5432/tabulin_test";
const root = process.cwd();

async function connect() {
  const c = new Client({ connectionString: URL });
  await c.connect();
  return c;
}

beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new globalThis.URL(URL).hostname)) throw new Error("tests only run against a local database");
  const c = await connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(root, "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await c.query(readFileSync(join(dir, f), "utf8"));
  await c.end();
});

describe("database rules", () => {
  it.each(["ledger_core", "integrasi", "cicilan"])("passes SQL scenario script %s", (name) => {
    // psql exits non-zero (execFileSync throws) on any failed check
    execFileSync("psql", [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(root, `tests/sql/${name}.sql`)], { stdio: ["ignore", "pipe", "pipe"] });
  });

  describe("concurrency", () => {
    let pid: number, billId: number, admin: number;
    beforeAll(async () => {
      const c = await connect();
      admin = (await c.query("INSERT INTO pengguna_admin (email,nama,peran,password_hash) VALUES ('c@x','C','keuangan','x') RETURNING id")).rows[0].id;
      pid = (await c.query(
        `INSERT INTO pendaftaran (nama,no_rm,no_hp,faskes_id,paket_id,hpht,tanggal_milestone,perkiraan_hpl,tarif_total,dp,target_50,setoran_min_bulanan)
         VALUES ('Race','00-00-01','081234567890',1,(SELECT id FROM paket LIMIT 1),today_jkt()-30,today_jkt()+166,today_jkt()+250,10000000,2000000,5000000,1000000) RETURNING id`)).rows[0].id;
      await c.query("SELECT setujui_pendaftaran($1,$2)", [pid, admin]);
      await c.query("SELECT pasang_va($1,NULL,$2)", [pid, admin]);
      billId = (await c.query("SELECT id FROM tagihan WHERE pendaftaran_id=$1", [pid])).rows[0].id;
      await c.end();
    });

    it("two simultaneous confirmations of the same bill: exactly one wins", async () => {
      const [a, b] = await Promise.all([connect(), connect()]);
      const run = (c: Client) => c.query("SELECT konfirmasi_setoran($1, today_jkt()-1, 2000000, $2, $3)", [pid, billId, admin]);
      const res = await Promise.allSettled([run(a), run(b)]);
      await Promise.all([a.end(), b.end()]);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(String(failed.reason.message)).toMatch(/TAGIHAN_SUDAH_LUNAS/);
      const c = await connect();
      const saldo = (await c.query("SELECT saldo FROM v_saldo WHERE pendaftaran_id=$1", [pid])).rows[0].saldo;
      await c.end();
      expect(Number(saldo)).toBe(2_000_000);
    });
  });
});

afterAll(() => undefined);
