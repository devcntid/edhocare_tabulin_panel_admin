import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bacaCsv, buatCsv } from "@/lib/csv";
import { buatPdfTabel } from "@/lib/pdf";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://USER:PASSWORD@localhost:5432/tabulin_test";
process.env.DATABASE_URL = URL;

describe("csv", () => {
  it("writes BOM, quotes special characters and neutralises spreadsheet formulas", () => {
    const t = buatCsv(["a", "b"], [["x,y", 'he said "hi"'], ["=1+1", -5], [null, "plain"]]);
    expect(t.startsWith("﻿")).toBe(true);
    expect(t).toContain('"x,y","he said ""hi"""');
    expect(t).toContain("'=1+1,-5"); // text gets a quote prefix, a real number stays a number
    expect(t).toContain(",plain");
  });
  it("reads quoted cells, embedded newlines, CRLF, BOM and a semicolon delimiter", () => {
    expect(bacaCsv('﻿a,b\r\n"x,1","l1\nl2"\r\n\r\n')).toEqual([["a", "b"], ["x,1", "l1\nl2"]]);
    expect(bacaCsv("a;b\n1;2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(() => bacaCsv('a,b\n"open,1\n')).toThrow(/kutip/);
  });
  it("round-trips what it writes", () => {
    const rows = [["a,b", 'q"q'], ["line1\nline2", "z"]];
    expect(bacaCsv(buatCsv(["h1", "h2"], rows))).toEqual([["h1", "h2"], ...rows]);
  });
});

describe("pdf table", () => {
  const pdf = (n: number) => buatPdfTabel({ judul: "Uji", subjudul: "s", kolom: [{ judul: "Nama" }, { judul: "Saldo", kanan: true }], baris: Array.from({ length: n }, (_, i) => [`Pasien ${i} (x)`, "Rp 1.000"]) }).toString("latin1");
  it("is a valid multi-page PDF", () => {
    expect(pdf(0)).toMatch(/^%PDF-1\.4/);
    expect(pdf(0)).toContain("/Count 1 ");
    const banyak = pdf(100);
    expect(Number(/\/Count (\d+)/.exec(banyak)![1])).toBeGreaterThan(1);
    expect(banyak.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(banyak).toContain("Pasien 99 \\(x\\)"); // parentheses escaped
  });
});

type Impor = typeof import("@/lib/services/impor");
type Ekspor = typeof import("@/lib/services/ekspor");
let db: Client, admin: number, impor: Impor, ekspor: Ekspor, hpht: string;
const galat = async (p: Promise<unknown>) => p.then(() => null, async (e) => (await import("@/lib/api")).toApiError(e));
const H = "no_rm,kode_faskes,cara_persalinan,kelas_kamar,jumlah_cicilan,hpht\n";
const jumlah = async () => Number((await db.query("SELECT count(*) FROM pendaftaran")).rows[0].count);

beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new globalThis.URL(URL).hostname)) throw new Error("tests only run against a local database");
  db = new Client({ connectionString: URL });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  admin = (await db.query("INSERT INTO pengguna_admin (email,nama,peran,password_hash) VALUES ('a@x','A','admin_program','x') RETURNING id")).rows[0].id;
  for (const rm of ["RM-1", "RM-2", "RM-3", "RM-4"]) await db.query("INSERT INTO pasien (no_rm,nama,no_hp) VALUES ($1,$2,'081200000001')", [rm, `Pasien ${rm}`]);
  const tab = await import("@/lib/services/tabungan");
  hpht = tab.addDays((await db.query("SELECT today_jkt()::text AS d")).rows[0].d, -70);
  impor = await import("@/lib/services/impor");
  ekspor = await import("@/lib/services/ekspor");
});
afterAll(async () => { await db.end(); });

describe("import registrations (CSV)", () => {
  const baris = (rm: string, extra: Partial<Record<string, string>> = {}) => {
    const v = { faskes: "BDG", cara: "Partus Normal", kelas: "Kelas 1", n: "2", hpht, ...extra };
    return `${rm},${v.faskes},${v.cara},${v.kelas},${v.n},${v.hpht}\n`;
  };

  it("validates without saving", async () => {
    const r = await impor.imporPendaftaran(H + baris("RM-1") + baris("RM-2"), { adminId: admin, periksa: true });
    expect(r).toMatchObject({ periksa: true, jumlah: 2, valid: 2, dibuat: 0, galat: [] });
    expect(await jumlah()).toBe(0);
  });

  it("is all-or-nothing and names the spreadsheet row of every problem", async () => {
    const f = H + baris("RM-1") + baris("RM-2", { faskes: "XXX" }) + baris("RM-1") + baris("RM-3", { hpht: "2026-02-31" }) + baris("RM-4", { cara: "tidak ada" });
    const r = await impor.imporPendaftaran(f, { adminId: admin, periksa: false });
    expect(r.dibuat).toBe(0);
    expect(r.galat.map((g) => [g.baris, g.no_rm])).toEqual([[3, "RM-2"], [4, "RM-1"], [5, "RM-3"], [6, "RM-4"]]);
    expect(r.galat[1].pesan).toMatch(/lebih dari sekali/);
    expect(await jumlah()).toBe(0);
  });

  it("imports a clean file (semicolons, DD/MM/YYYY dates, any letter case), audits it and refuses to import it twice", async () => {
    const [y, m, d] = hpht.split("-");
    const f = "NO_RM;Kode_Faskes;cara_persalinan;kelas_kamar;jumlah_cicilan;hpht\n" + `RM-1;bdg;partus normal;kelas 1;2;${hpht}\n` + `RM-2;CJR;Partus Normal;Kelas 2;2;${Number(d)}/${Number(m)}/${y}\n`;
    const r = await impor.imporPendaftaran(f, { adminId: admin, periksa: false });
    expect(r).toMatchObject({ dibuat: 2, galat: [] });
    expect(await jumlah()).toBe(2);
    expect((await db.query("SELECT hpht::text, status_pendaftaran FROM pendaftaran WHERE no_rm = 'RM-2'")).rows[0]).toEqual({ hpht, status_pendaftaran: "menunggu_verifikasi" });
    expect((await db.query("SELECT sesudah FROM audit_log WHERE aksi = 'impor'")).rows).toEqual([{ sesudah: { baris: 2 } }]);
    const lagi = await impor.imporPendaftaran(H + baris("RM-1"), { adminId: admin, periksa: false });
    expect(lagi.galat[0].pesan).toMatch(/sudah memiliki pendaftaran/);
    expect(await jumlah()).toBe(2);
  });

  it("rejects files with a missing column, no rows or too many rows", async () => {
    expect(await galat(impor.imporPendaftaran("no_rm,hpht\nRM-3,2026-01-01\n", { adminId: admin, periksa: true }))).toMatchObject({ status: 422, code: "FILE_TIDAK_VALID" });
    expect(await galat(impor.imporPendaftaran(H, { adminId: admin, periksa: true }))).toMatchObject({ code: "FILE_TIDAK_VALID" });
    expect(await galat(impor.imporPendaftaran(H + baris("RM-3").repeat(501), { adminId: admin, periksa: true }))).toMatchObject({ code: "FILE_TIDAK_VALID" });
  });

  it("normalises Excel dates and rejects impossible ones", () => {
    expect(impor.normalHpht("2026-03-01")).toBe("2026-03-01");
    expect(impor.normalHpht("1/3/2026")).toBe("2026-03-01");
    expect(impor.normalHpht("01-03-2026")).toBe("2026-03-01");
    expect(impor.normalHpht("2026-02-31")).toBeNull();
    expect(impor.normalHpht("besok")).toBeNull();
  });
});

describe("export", () => {
  const o = (format: string, extra: Record<string, unknown> = {}) => ({ format, adminId: admin, hariIni: "2026-11-17", ...extra });

  it("writes CSV that follows the search and filter, with a trail in the audit log", async () => {
    const f = await ekspor.ekspor("pendaftaran", o("csv", { q: "RM-1" }));
    expect(f).toMatchObject({ tipe: "text/csv; charset=utf-8", nama: "tabulin-pendaftaran-2026-11-17.csv", baris: 1 });
    const t = bacaCsv(f.isi.toString("utf8"));
    expect(t[0]).toContain("No. RM");
    expect(t).toHaveLength(2);
    expect(t[1]).toContain("RM-1");
    expect((await ekspor.ekspor("pendaftaran", o("csv", { filter: "aktif" }))).baris).toBe(0);
    expect((await db.query("SELECT sesudah FROM audit_log WHERE aksi = 'ekspor' ORDER BY id LIMIT 1")).rows[0].sesudah).toMatchObject({ format: "csv", q: "RM-1", baris: 1 });
  });

  it("writes a PDF and every dataset runs", async () => {
    const p = await ekspor.ekspor("pendaftaran", o("pdf"));
    expect(p.tipe).toBe("application/pdf");
    expect(p.isi.subarray(0, 5).toString()).toBe("%PDF-");
    for (const k of Object.keys(ekspor.DATASET)) expect((await ekspor.ekspor(k, o("csv"))).isi.length).toBeGreaterThan(0);
  });

  it("refuses unknown datasets and formats; audit export needs super admin", async () => {
    expect(await galat(ekspor.ekspor("pengguna_admin", o("csv")))).toMatchObject({ status: 404 });
    expect(await galat(ekspor.ekspor("pendaftaran", o("xls")))).toMatchObject({ status: 422 });
    expect(await galat(ekspor.ekspor("__proto__", o("csv")))).toMatchObject({ status: 404 });
    expect(ekspor.DATASET.audit.izin).toBe("kelola_pengguna");
  });
});
