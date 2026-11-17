import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const URL = process.env.TEST_DATABASE_URL ?? "postgresql://USER:PASSWORD@localhost:5432/tabulin_test";
process.env.DATABASE_URL = URL;

type App = typeof import("@/lib/services/app");
type Klaim = typeof import("@/lib/services/klaim");
type Bukti = typeof import("@/lib/services/bukti");
let app: App, klaim: Klaim, bukti: Bukti, db: Client, admin: number, hpht: string, tagihan: string;
const pasien = (no_rm: string) => ({ no_rm, nama: `Pasien ${no_rm}`, no_hp: "081200000001" });
const galat = async (p: Promise<unknown>) => p.then(() => null, async (e) => (await import("@/lib/api")).toApiError(e));
const h = { limit: 20, offset: 0 };
const url = (q = "") => new globalThis.URL(`http://x/api/v1/payment-claims${q}`);

const PDF = Buffer.from("%PDF-1.4 bukti");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function form(o: Record<string, string | undefined> = {}, file: { data: Buffer; type: string; name?: string } | null = { data: PDF, type: "application/pdf" }) {
  const f = new FormData();
  const v = { id_tagihan: tagihan, nominal_transfer: "9800000", tanggal_transfer: "2026-01-01", bank_asal: "BCA", nama_pengirim: "Pasien RM-1", ...o };
  for (const [k, val] of Object.entries(v)) if (val !== undefined) f.set(k, val);
  if (file) f.set("file_bukti", new File([new Uint8Array(file.data)], file.name ?? "bukti.pdf", { type: file.type }));
  return f;
}
const setFitur = (n: number) => db.query("UPDATE konfigurasi SET nilai = to_jsonb($1::int) WHERE kunci = 'fitur_klaim_aktif'", [n]);

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
  klaim = await import("@/lib/services/klaim");
  bukti = await import("@/lib/services/bukti");
  const tab = await import("@/lib/services/tabungan");
  hpht = tab.addDays((await db.query("SELECT today_jkt()::text AS d")).rows[0].d, -70);
  const e = await app.daftarApp(pasien("RM-1"), {
    kode_faskes: "BDG", kode_cara_persalinan: "partus_normal", kode_kelas_kamar: "kelas_1", hpht, no_hp: "081200000001",
    persetujuan_disetujui: true, versi_persetujuan: "v1", jenis_rencana: "minimum",
  }, null);
  await db.query("SELECT setujui_pendaftaran($1,$2)", [e.id_pendaftaran, admin]);
  await db.query("SELECT pasang_va($1,'8800000000000001',$2)", [e.id_pendaftaran, admin]); // issues the DP bill
  tagihan = (await db.query("SELECT nomor FROM tagihan WHERE pendaftaran_id = $1 AND jenis = 'dp'", [e.id_pendaftaran])).rows[0].nomor;
});

afterAll(async () => {
  await db.end();
});

describe("claims switch (K9 off by default)", () => {
  it("is off in GET /program and refuses E-13 / E-15 with FITUR_TIDAK_AKTIF", async () => {
    expect((await import("@/lib/services/app")).program).toBeTypeOf("function");
    expect((await app.program()).konfigurasi.fitur_klaim_aktif).toBe(false);
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form(), null))).toMatchObject({ status: 403, code: "FITUR_TIDAK_AKTIF" });
    expect(await galat(klaim.daftarKlaim(pasien("RM-1"), url(), h))).toMatchObject({ status: 403, code: "FITUR_TIDAK_AKTIF" });
    expect((await app.tagihanDetail(pasien("RM-1"), tagihan)).klaim).toEqual([]);
  });
});

describe("claims (E-13, E-15, TGH-10)", () => {
  beforeAll(() => setFitur(1));

  it("creates a claim without touching the balance, marks the bill and notifies without amounts", async () => {
    const k = await klaim.ajukanKlaim(pasien("RM-1"), form(), "kunci-klaim-1");
    expect(k).toMatchObject({ id_klaim: expect.stringMatching(/^KLM-/), id_tagihan: tagihan, nominal_transfer: 9_800_000, status_klaim: "menunggu_konfirmasi", alasan_penolakan_klaim: null, url_file_bukti: null });
    const b = await app.tagihanDetail(pasien("RM-1"), tagihan);
    expect(b.status_tagihan).toBe("menunggu_konfirmasi");
    expect(b.klaim).toHaveLength(1);
    expect((await db.query("SELECT coalesce(sum(nominal_transaksi),0)::int AS s FROM transaksi")).rows[0].s).toBe(0);
    const n = (await db.query("SELECT judul, isi, kategori FROM notifikasi WHERE templat_kode = 'pembayaran_diproses'")).rows[0];
    expect(n.kategori).toBe("pembayaran");
    expect(n.judul + n.isi).not.toMatch(/\d{1,3}\.\d{3}/);
  });

  it("is idempotent per Idempotency-Key and refuses a second pending claim (KLAIM_SUDAH_ADA)", async () => {
    const again = await klaim.ajukanKlaim(pasien("RM-1"), form(), "kunci-klaim-1");
    expect(again.id_klaim).toBe((await klaim.daftarKlaim(pasien("RM-1"), url(), h))[0].id_klaim);
    expect((await db.query("SELECT count(*)::int AS n FROM klaim_pembayaran")).rows[0].n).toBe(1);
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form(), "kunci-klaim-2"))).toMatchObject({ status: 409, code: "KLAIM_SUDAH_ADA" });
  });

  it("validates fields, file type, signature and size", async () => {
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form({ id_tagihan: undefined, bank_asal: "XYZ", nominal_transfer: "0" }, null), null))).toMatchObject({
      status: 422, fields: { id_tagihan: expect.any(String), bank_asal: expect.any(String), nominal_transfer: expect.any(String), file_bukti: expect.any(String) },
    });
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form({}, { data: PDF, type: "text/plain" }), null))).toMatchObject({ status: 415, code: "TIPE_BERKAS_TIDAK_DIDUKUNG" });
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form({}, { data: Buffer.from("bukan pdf"), type: "application/pdf" }), null))).toMatchObject({ status: 415 });
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form({}, { data: Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]), type: "application/pdf" }), null))).toMatchObject({ status: 413, code: "BERKAS_TERLALU_BESAR" });
  });

  it("refuses another patient's bill and a patient without an active enrollment", async () => {
    expect(await galat(klaim.ajukanKlaim(pasien("RM-2"), form(), null))).toMatchObject({ status: 409, code: "PENDAFTARAN_TIDAK_AKTIF" });
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form({ id_tagihan: "INV-TIDAK-ADA" }, { data: PNG, type: "image/png", name: "b.png" }), "k-x"))).toMatchObject({ status: 404 });
  });

  it("lists pending claims by default and filters by status (E-15)", async () => {
    expect(await klaim.daftarKlaim(pasien("RM-1"), url(), h)).toHaveLength(1);
    expect(await klaim.daftarKlaim(pasien("RM-1"), url("?status_klaim=ditolak"), h)).toHaveLength(0);
    expect(await galat(klaim.daftarKlaim(pasien("RM-1"), url("?status_klaim=aneh"), h))).toMatchObject({ status: 422 });
    expect(await klaim.daftarKlaim(pasien("RM-2"), url(), h).catch(() => "x")).toEqual([]);
  });

  it("a rejected claim reopens the bill, needs a reason, and cannot be rejected twice", async () => {
    const id = (await db.query("SELECT id FROM klaim_pembayaran WHERE status = 'menunggu_konfirmasi'")).rows[0].id;
    await expect(db.query("SELECT tolak_klaim($1,'  ',$2)", [id, admin])).rejects.toThrow(/ALASAN_WAJIB/);
    await db.query("SELECT tolak_klaim($1,'Dana belum ditemukan di rekening VA.',$2)", [id, admin]);
    const b = await app.tagihanDetail(pasien("RM-1"), tagihan);
    expect(b.status_tagihan).not.toBe("menunggu_konfirmasi");
    expect(b.klaim[0]).toMatchObject({ status_klaim: "ditolak", alasan_penolakan_klaim: "Dana belum ditemukan di rekening VA." });
    await expect(db.query("SELECT tolak_klaim($1,'lagi',$2)", [id, admin])).rejects.toThrow(/KLAIM_TIDAK_VALID/);
    expect(await klaim.daftarKlaim(pasien("RM-1"), url(), h)).toHaveLength(1); // rejected stays visible
    expect((await db.query("SELECT 1 FROM notifikasi WHERE templat_kode = 'klaim_ditolak'")).rowCount).toBe(1);
  });

  it("a deposit that pays the bill settles the pending claim", async () => {
    expect(await galat(klaim.ajukanKlaim(pasien("RM-1"), form({ tanggal_transfer: "2999-01-01" }), null))).toMatchObject({ status: 422, code: "TANGGAL_TIDAK_VALID" });
    await klaim.ajukanKlaim(pasien("RM-1"), form(), "kunci-klaim-3"); // allowed again after the rejection
    expect((await app.tagihanDetail(pasien("RM-1"), tagihan)).status_tagihan).toBe("menunggu_konfirmasi");
    await db.query("SELECT * FROM terima_setoran_api('8800000000000001','BCA-1', today_jkt() - 1, 9800000, $1)", [tagihan]);
    expect((await db.query("SELECT status FROM klaim_pembayaran ORDER BY id DESC LIMIT 1")).rows[0].status).toBe("dikonfirmasi");
    expect((await app.tagihanDetail(pasien("RM-1"), tagihan)).status_tagihan).toBe("lunas");
    expect(await klaim.daftarKlaim(pasien("RM-1"), url(), h)).toHaveLength(1); // only the rejected one remains
  });
});

describe("receipt (E-09)", () => {
  const nomor = () => db.query("SELECT nomor FROM transaksi ORDER BY id LIMIT 1").then((r) => r.rows[0].nomor as string);

  it("returns the transaction, its bill and a signed PDF link", async () => {
    const t = await nomor();
    const r = await bukti.receipt(pasien("RM-1"), t, "http://app.test");
    expect(r).toMatchObject({
      transaksi: { id_transaksi: t, jenis_transaksi: "dp", nominal_transaksi: 9_800_000, status_transaksi: "terkonfirmasi", id_tagihan: tagihan },
      tagihan: { id_tagihan: tagihan, status_tagihan: "lunas" },
      nama_berkas_bukti: `Bukti-Tabulin-${t}.pdf`,
    });
    expect(r.url_bukti_pdf).toMatch(new RegExp(`^http://app\\.test/api/v1/receipt/${t}/pdf\\?token=`));
    expect(new Date(r.url_berlaku_sampai).getTime()).toBeGreaterThan(Date.now());
  });

  it("serves a real PDF only for a valid token that matches the transaction", async () => {
    const t = await nomor();
    const token = new globalThis.URL((await bukti.receipt(pasien("RM-1"), t, "http://app.test")).url_bukti_pdf).searchParams.get("token");
    const f = await bukti.pdfBuktiDariToken(t, token);
    expect(f.nama).toBe(`Bukti-Tabulin-${t}.pdf`);
    expect(f.isi.subarray(0, 5).toString()).toBe("%PDF-");
    expect(f.isi.toString("latin1")).toContain("Bukti Transaksi Tabulin");
    expect(f.isi.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect(await galat(bukti.pdfBuktiDariToken(t, "abc"))).toMatchObject({ status: 401 });
    expect(await galat(bukti.pdfBuktiDariToken(t, null))).toMatchObject({ status: 401 });
    expect(await galat(bukti.pdfBuktiDariToken("TRX-LAIN", token))).toMatchObject({ status: 401 });
    expect((await bukti.pdfBuktiAdmin((await db.query("SELECT id FROM transaksi LIMIT 1")).rows[0].id)).isi.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("hides other patients' transactions and validates the parameter", async () => {
    expect(await galat(bukti.receipt(pasien("RM-2"), await nomor(), "http://app.test"))).toMatchObject({ status: 404 });
    expect(await galat(bukti.receipt(pasien("RM-1"), null, "http://app.test"))).toMatchObject({ status: 422, fields: { id_transaksi: expect.any(String) } });
  });
});
