// Patient-app API (contract E-01..E-12, E-14). Thin mapping from the admin data model to the contract's field names.
import { z } from "zod";
import { ApiError } from "@/lib/api";
import type { Halaman, PasienApp } from "@/lib/app-api";
import { pool } from "@/lib/db";
import { KONFIGURASI_TETAP, PROGRAM } from "@/lib/program";
import { klaimTagihan } from "@/lib/services/klaim";
import { paketUntuk, tarifPaket } from "@/lib/services/master";
import { cekHpht, detail, konfig, today } from "@/lib/services/pendaftaran";
import { hitungPaket, simulasi } from "@/lib/services/tabungan";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const tierSlug = (t: string) => (t.includes("Premium") ? "premium" : "essential");

const JENIS_TRANSAKSI: Record<string, string> = {
  DP: "dp", "Setoran bulanan": "setoran_bulanan", "Setoran bulanan + tambahan": "setoran_bulanan_tambahan", "Setoran tambahan": "setoran_tambahan", Koreksi: "koreksi",
};
const JENIS_BALIK = Object.fromEntries(Object.entries(JENIS_TRANSAKSI).map(([k, v]) => [v, k]));

const wajib = (msg = "Field ini wajib diisi.") => z.string(msg).trim().min(1, msg);

// ---------- E-01 program ----------
export async function program() {
  const [cfg, kanal, min] = await Promise.all([
    konfig(),
    pool.query(
      `SELECT k.kode, k.nama, coalesce(array_agg(i.isi ORDER BY i.urutan, i.id) FILTER (WHERE i.id IS NOT NULL), '{}') AS langkah
       FROM kanal_pembayaran k LEFT JOIN instruksi_pembayaran i ON i.kanal_id = k.id AND i.aktif WHERE k.aktif GROUP BY k.id ORDER BY k.urutan, k.id`),
    pool.query("SELECT min(setoran_min_bulanan) AS m FROM opsi_kelas_kamar WHERE aktif"),
  ]);
  return {
    ...PROGRAM,
    kanal_pembayaran: kanal.rows.map((k) => ({ kode_kanal: k.kode, nama_kanal: k.nama, langkah_kanal: k.langkah })),
    konfigurasi: {
      persen_dp: cfg.dpPersen, persen_target: cfg.targetPersen, minggu_milestone: cfg.milestoneMinggu,
      setoran_min_terendah: min.rows[0].m, batas_hpht_maks_hari: cfg.batasUsia, fitur_klaim_aktif: cfg.klaimAktif, ...KONFIGURASI_TETAP,
    },
  };
}

// ---------- E-02 packages ----------
export async function paketKatalog(kodeFaskes?: string) {
  const [faskes, cara, kelas, paket, cfg] = await Promise.all([
    pool.query("SELECT kode, nama, aktif FROM faskes ORDER BY id"),
    pool.query("SELECT nama FROM opsi_cara_persalinan WHERE aktif ORDER BY id"),
    pool.query("SELECT nama, tier FROM opsi_kelas_kamar WHERE aktif ORDER BY id"),
    // Tariff per package via tarif_paket(): explicit BRD tariff (harga_paket, migration 0013), else cara price + kelas price (0010).
    pool.query(
      `SELECT * FROM (
         SELECT f.kode AS kode_faskes, c.nama AS cara, k.nama AS kelas, k.tier, k.setoran_min_bulanan, tarif_paket(f.id, c.nama, k.nama) AS tarif_total, f.id AS fid, c.id AS cid, k.id AS kid
         FROM faskes f CROSS JOIN opsi_cara_persalinan c CROSS JOIN opsi_kelas_kamar k
         WHERE f.aktif AND c.aktif AND k.aktif AND ($1::text IS NULL OR f.kode = $1)) x
       WHERE tarif_total IS NOT NULL ORDER BY fid, cid, kid`, [kodeFaskes ?? null]),
    konfig(),
  ]);
  return {
    faskes: faskes.rows.map((f) => ({ kode_faskes: f.kode, nama_faskes: f.nama, faskes_aktif: f.aktif })),
    cara_persalinan: cara.rows.map((c) => ({ kode_cara_persalinan: slug(c.nama), nama_cara_persalinan: c.nama })),
    kelas_kamar: kelas.rows.map((k) => ({ kode_kelas_kamar: slug(k.nama), nama_kelas_kamar: k.nama, tier: tierSlug(k.tier), nama_tier: k.tier })),
    paket: paket.rows.map((p) => {
      const n = hitungPaket(p.tarif_total, "2000-01-01", cfg.dpPersen, cfg.targetPersen, cfg.milestoneMinggu, cfg.hplMinggu);
      return {
        kode_paket: `${p.kode_faskes}-${slug(p.cara)}-${slug(p.kelas)}`, kode_faskes: p.kode_faskes, kode_cara_persalinan: slug(p.cara), kode_kelas_kamar: slug(p.kelas),
        tarif_total: p.tarif_total, dp: n.dp, target_50: n.target_50, setoran_min_bulanan: p.setoran_min_bulanan, tier: tierSlug(p.tier),
      };
    }),
  };
}

// ---------- shared: resolve the chosen faskes / cara / kelas to a package ----------
const pilihanSchema = z.object({
  kode_faskes: wajib(),
  kode_cara_persalinan: wajib(),
  kode_kelas_kamar: wajib(),
  hpht: z.string("Field ini wajib diisi.").regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
});

type Pilihan = {
  faskes: { id: number; kode: string; nama: string };
  cara: string;
  kelas: { nama: string; tier: string; setoran_min_bulanan: number };
  tarif_total: number;
};

async function pilih(b: z.infer<typeof pilihanSchema>): Promise<Pilihan> {
  const [faskes, cara, kelas] = await Promise.all([
    pool.query("SELECT id, kode, nama FROM faskes WHERE kode = $1 AND aktif", [b.kode_faskes]),
    pool.query("SELECT nama FROM opsi_cara_persalinan WHERE aktif"),
    pool.query("SELECT nama, tier, setoran_min_bulanan FROM opsi_kelas_kamar WHERE aktif"),
  ]);
  const c = cara.rows.find((r) => slug(r.nama) === b.kode_cara_persalinan)?.nama as string | undefined;
  const k = kelas.rows.find((r) => slug(r.nama) === b.kode_kelas_kamar) as Pilihan["kelas"] | undefined;
  const fields: Record<string, string> = {};
  if (!faskes.rows[0]) fields.kode_faskes = "Faskes tidak ditemukan.";
  if (!c) fields.kode_cara_persalinan = "Cara persalinan tidak ditemukan.";
  if (!k) fields.kode_kelas_kamar = "Kelas kamar tidak ditemukan.";
  const tarif = faskes.rows[0] && c && k ? await tarifPaket(faskes.rows[0].id, c, k.nama) : null;
  if (faskes.rows[0] && c && k && tarif == null) fields.kode_faskes = "Harga belum diatur untuk faskes ini.";
  if (Object.keys(fields).length) throw new ApiError(422, "VALIDASI", "Data belum lengkap.", fields);
  return { faskes: faskes.rows[0], cara: c!, kelas: k!, tarif_total: tarif! };
}

const echo = (s: Pilihan) => ({
  kode_faskes: s.faskes.kode, nama_faskes: s.faskes.nama,
  kode_cara_persalinan: slug(s.cara), nama_cara_persalinan: s.cara,
  kode_kelas_kamar: slug(s.kelas.nama), nama_kelas_kamar: s.kelas.nama,
  tier: tierSlug(s.kelas.tier), nama_tier: s.kelas.tier,
});

// ---------- E-03 simulations ----------
export async function simulasiApp(raw: unknown) {
  const b = pilihanSchema.parse(raw);
  const [s, cfg, hariIni] = await Promise.all([pilih(b), konfig(), today()]);
  cekHpht(b.hpht, hariIni, cfg.batasUsia);
  const tarif = s.tarif_total;
  const min = s.kelas.setoran_min_bulanan;
  const n = hitungPaket(tarif, b.hpht, cfg.dpPersen, cfg.targetPersen, cfg.milestoneMinggu, cfg.hplMinggu);
  return {
    ...echo(s), hpht: b.hpht,
    tarif_total: tarif, dp: n.dp, target_50: n.target_50, setoran_min_bulanan: min,
    tanggal_milestone: n.tanggal_milestone, perkiraan_hpl: n.perkiraan_hpl,
    ...simulasi({ tarif_total: tarif, setoran_min_bulanan: min, ...n }, b.hpht, hariIni, cfg.hari),
    dihitung_pada: new Date().toISOString(),
  };
}

// ---------- registration rows ----------
const SELECT_PENDAFTARAN = `
  SELECT p.*, f.kode AS kode_faskes, f.nama AS nama_faskes, k.cara_persalinan, k.kelas_kamar, k.tier
  FROM pendaftaran p JOIN faskes f ON f.id = p.faskes_id JOIN paket k ON k.id = p.paket_id`;

type Baris = {
  id: number; nomor: string; status_pendaftaran: string; kode_faskes: string; nama_faskes: string; cara_persalinan: string; kelas_kamar: string; tier: string;
  hpht: string; perkiraan_hpl: string; tanggal_milestone: string; tarif_total: number; dp: number; target_50: number; setoran_min_bulanan: number;
  jenis_rencana: string; persetujuan_versi: string; persetujuan_pada: string; dibuat_pada: string; diputuskan_pada: string | null; alasan_penolakan: string | null;
  bank_va: string; no_va: string | null; nama_va: string | null; total_setoran: number | null; selesai_pada: string | null;
};

const intiPendaftaran = (p: Baris) => ({
  id_pendaftaran: String(p.id), no_pendaftaran: p.nomor, status_pendaftaran: p.status_pendaftaran,
  kode_faskes: p.kode_faskes, nama_faskes: p.nama_faskes,
  kode_cara_persalinan: slug(p.cara_persalinan), nama_cara_persalinan: p.cara_persalinan,
  kode_kelas_kamar: slug(p.kelas_kamar), nama_kelas_kamar: p.kelas_kamar,
  tier: tierSlug(p.tier), nama_tier: p.tier,
  hpht: p.hpht, perkiraan_hpl: p.perkiraan_hpl, tanggal_milestone: p.tanggal_milestone,
  tarif_total: p.tarif_total, dp: p.dp, target_50: p.target_50, setoran_min_bulanan: p.setoran_min_bulanan,
  jenis_rencana: p.jenis_rencana, versi_persetujuan: p.persetujuan_versi,
  persetujuan_disetujui_pada: p.persetujuan_pada, dikirim_pada: p.dibuat_pada,
});

// ---------- E-04 enrollments ----------
const daftarSchema = pilihanSchema.extend({
  no_hp: z.string("Field ini wajib diisi.").regex(/^[0-9]{10,13}$/, "Nomor HP harus 10 sampai 13 digit angka."),
  persetujuan_disetujui: z.literal(true, "Persetujuan wajib dicentang."),
  versi_persetujuan: wajib(),
  jenis_rencana: z.enum(["minimum", "disarankan"], "Pilih rencana setoran.").default("minimum"),
});

export async function daftarApp(pasien: PasienApp, raw: unknown, kunci: string | null) {
  const b = daftarSchema.parse(raw);
  if (kunci) {
    const ada = (await pool.query(`${SELECT_PENDAFTARAN} WHERE p.id = (SELECT pendaftaran_id FROM kunci_idempotensi WHERE no_rm = $1 AND kunci = $2)`, [pasien.no_rm, kunci])).rows[0] as Baris | undefined;
    if (ada) return intiPendaftaran(ada);
  }
  if (b.versi_persetujuan !== PROGRAM.versi_persetujuan) throw new ApiError(409, "VERSI_PERSETUJUAN_BERUBAH", "Teks persetujuan telah diperbarui. Muat ulang dan setujui kembali.");
  const [s, cfg, hariIni] = await Promise.all([pilih(b), konfig(), today()]);
  cekHpht(b.hpht, hariIni, cfg.batasUsia);
  const n = hitungPaket(s.tarif_total, b.hpht, cfg.dpPersen, cfg.targetPersen, cfg.milestoneMinggu, cfg.hplMinggu);
  const paket = (await paketUntuk(s.cara, s.kelas.nama))!;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      `INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, hpht, tanggal_milestone, perkiraan_hpl, jenis_rencana, persetujuan_versi, tarif_total, dp, target_50, setoran_min_bulanan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [pasien.nama, pasien.no_rm, b.no_hp, s.faskes.id, paket.id, b.hpht, n.tanggal_milestone, n.perkiraan_hpl, b.jenis_rencana, b.versi_persetujuan, s.tarif_total, n.dp, n.target_50, paket.setoran_min_bulanan],
    );
    if (kunci) await c.query("INSERT INTO kunci_idempotensi (no_rm, kunci, pendaftaran_id) VALUES ($1,$2,$3)", [pasien.no_rm, kunci, rows[0].id]);
    await c.query("SELECT catat_audit(NULL,'buat','pendaftaran',$1,NULL,$2)", [rows[0].id, JSON.stringify({ sumber: "aplikasi", no_rm: pasien.no_rm })]);
    const dibuat = (await c.query(`${SELECT_PENDAFTARAN} WHERE p.id = $1`, [rows[0].id])).rows[0] as Baris;
    await c.query("COMMIT");
    return intiPendaftaran(dibuat);
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { constraint?: string }).constraint === "pendaftaran_satu_aktif") throw new ApiError(409, "PENDAFTARAN_SUDAH_ADA", "Anda sudah memiliki pendaftaran Tabulin yang berjalan.");
    throw e;
  } finally {
    c.release();
  }
}

// ---------- E-05 enrollments/me ----------
const profil = (p: PasienApp) => ({ nama_pasien: p.nama, no_rm: p.no_rm, no_hp: p.no_hp, tanggal_lahir: null });

async function belumDibaca(noRm: string): Promise<number> {
  return (await pool.query("SELECT count(*)::int AS n FROM notifikasi n JOIN pendaftaran p ON p.id = n.pendaftaran_id WHERE p.no_rm = $1 AND NOT n.dibaca", [noRm])).rows[0].n;
}

export type TagihanRow = { nomor: string; jenis: string; periode: string; nominal: number; terbit_pada: string; jatuh_tempo: string; status: string; status_tampil: string; ref_transaksi: string | null };
export const tagihanDto = (g: TagihanRow) => ({
  id_tagihan: g.nomor, no_tagihan: g.nomor, jenis_tagihan: g.jenis, periode_tagihan: g.periode, nominal_tagihan: g.nominal,
  tanggal_terbit: g.terbit_pada, tanggal_jatuh_tempo: g.jatuh_tempo, status_tagihan: g.status_tampil, id_transaksi: g.ref_transaksi,
});

export async function pendaftaranSaya(pasien: PasienApp) {
  const p = (await pool.query(`${SELECT_PENDAFTARAN} WHERE p.no_rm = $1 ORDER BY p.id DESC LIMIT 1`, [pasien.no_rm])).rows[0] as Baris | undefined;
  const unread = await belumDibaca(pasien.no_rm);
  if (!p) return { status_pendaftaran: "belum_terdaftar", profil: profil(pasien), jumlah_notifikasi_belum_dibaca: unread };
  const hasil: Record<string, unknown> = {
    ...intiPendaftaran(p), profil: profil(pasien),
    diputuskan_pada: p.diputuskan_pada, kedaluwarsa_pada: null, alasan_penolakan: p.alasan_penolakan,
    jumlah_notifikasi_belum_dibaca: unread,
  };
  if (p.status_pendaftaran !== "aktif" && p.status_pendaftaran !== "selesai") return hasil;
  const d = await detail(p.id);
  const aktif = d.tagihan.filter((g: TagihanRow) => g.status !== "lunas").sort((a: TagihanRow, b: TagihanRow) => a.jatuh_tempo.localeCompare(b.jatuh_tempo))[0];
  return {
    ...hasil,
    usia_kehamilan_minggu: d.usia_kehamilan.minggu, usia_kehamilan_hari: d.usia_kehamilan.hari,
    bank_va: p.bank_va, no_va: p.no_va, nama_pemilik_va: p.nama_va,
    saldo: d.pendaftaran.saldo, saldo_diperbarui_pada: d.transaksi[0]?.tanggal_konfirmasi ?? null,
    sisa_ke_target_50: d.pendaftaran.sisa_ke_target_50, progres_ke_50: Number(d.pendaftaran.progres_ke_50), progres_ke_100: Number(d.pendaftaran.progres_ke_100),
    status_tabungan: d.status?.badge ?? null,
    proyeksi_saldo_milestone: d.status?.proyeksi_saldo_milestone ?? null, proyeksi_kekurangan_milestone: d.status?.proyeksi_kekurangan_milestone ?? null,
    rencana_kumulatif: d.status?.rencana_kumulatif ?? null, selisih_rencana: d.status?.selisih_rencana ?? null,
    tagihan_aktif: aktif ? tagihanDto(aktif) : null,
    // DFT-38/39: shown on the "Tabungan selesai" screen (U-12).
    total_setoran: p.status_pendaftaran === "selesai" ? (p.total_setoran == null ? null : Number(p.total_setoran)) : null,
    selesai_pada: p.status_pendaftaran === "selesai" ? p.selesai_pada : null,
  };
}

// ---------- E-06 / E-07 bills ----------
const kelompokSchema = z.object({ kelompok: z.enum(["aktif", "riwayat", "semua"]).default("semua") });

export async function tagihanList(pasien: PasienApp, url: URL, h: Halaman) {
  const { kelompok } = kelompokSchema.parse(Object.fromEntries(url.searchParams));
  const { rows } = await pool.query(
    `SELECT g.* FROM v_tagihan_status g JOIN pendaftaran p ON p.id = g.pendaftaran_id
     WHERE p.no_rm = $1 AND ($2 = 'semua' OR ($2 = 'aktif' AND g.status = 'belum_dibayar') OR ($2 = 'riwayat' AND g.status = 'lunas'))
     ORDER BY g.jatuh_tempo DESC, g.id DESC LIMIT $3 OFFSET $4`,
    [pasien.no_rm, kelompok, h.limit + 1, h.offset],
  );
  return rows.map(tagihanDto);
}

export async function tagihanDetail(pasien: PasienApp, nomor: string) {
  const g = (await pool.query("SELECT g.* FROM v_tagihan_status g JOIN pendaftaran p ON p.id = g.pendaftaran_id WHERE p.no_rm = $1 AND g.nomor = $2", [pasien.no_rm, nomor])).rows[0];
  if (!g) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  return { ...tagihanDto(g), klaim: await klaimTagihan(pasien.no_rm, nomor) };
}

// ---------- E-08 ledger ----------
const ledgerSchema = z.object({
  jenis_transaksi: z.string().optional(),
  bulan: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format bulan harus YYYY-MM.").optional(),
});

export async function ledger(pasien: PasienApp, url: URL, h: Halaman) {
  const q = ledgerSchema.parse(Object.fromEntries(url.searchParams));
  const jenis = q.jenis_transaksi?.split(",").map((j) => JENIS_BALIK[j.trim()]);
  if (jenis?.some((j) => !j)) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { jenis_transaksi: "Jenis transaksi tidak dikenal." });
  const { rows } = await pool.query(
    `SELECT t.*, g.nomor AS nomor_tagihan FROM transaksi t JOIN pendaftaran p ON p.id = t.pendaftaran_id LEFT JOIN tagihan g ON g.id = t.tagihan_id
     WHERE p.no_rm = $1 AND ($2::text[] IS NULL OR t.jenis = ANY($2))
       AND ($3::text IS NULL OR to_char(t.tanggal_konfirmasi AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') = $3)
     ORDER BY t.id DESC LIMIT $4 OFFSET $5`,
    [pasien.no_rm, jenis ?? null, q.bulan ?? null, h.limit + 1, h.offset],
  );
  return rows.map(transaksiDto);
}

/** Ledger row joined with its bill number (`nomor_tagihan`, null for an extra deposit) -> contract §3.7. */
export const transaksiDto = (t: { nomor: string; jenis: string; nominal_transaksi: number; tanggal_bayar: string; tanggal_konfirmasi: string; saldo_setelah: number; nomor_tagihan: string | null }) => ({
  id_transaksi: t.nomor, no_referensi: t.nomor, jenis_transaksi: JENIS_TRANSAKSI[t.jenis], nominal_transaksi: t.nominal_transaksi,
  tanggal_bayar: t.tanggal_bayar, tanggal_konfirmasi: t.tanggal_konfirmasi, status_transaksi: "terkonfirmasi", saldo_setelah: t.saldo_setelah,
  id_tagihan: t.nomor_tagihan, no_tagihan: t.nomor_tagihan,
});

// ---------- E-10 / E-14 devices ----------
const perangkatSchema = z.object({
  token_fcm: wajib(),
  platform: z.enum(["android", "ios"], "Platform harus android atau ios."),
  id_perangkat: wajib().max(200),
  versi_aplikasi: z.string().trim().max(40).optional(),
});

export async function daftarPerangkat(pasien: PasienApp, raw: unknown) {
  const b = perangkatSchema.parse(raw);
  const { rows } = await pool.query(
    `INSERT INTO perangkat (no_rm, id_perangkat, token_fcm, platform, versi_aplikasi) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id_perangkat) DO UPDATE SET no_rm = EXCLUDED.no_rm, token_fcm = EXCLUDED.token_fcm, platform = EXCLUDED.platform, versi_aplikasi = EXCLUDED.versi_aplikasi, terdaftar_pada = now()
     RETURNING token_fcm, platform, id_perangkat, versi_aplikasi, terdaftar_pada`,
    [pasien.no_rm, b.id_perangkat, b.token_fcm, b.platform, b.versi_aplikasi ?? null],
  );
  return rows[0];
}

export async function hapusPerangkat(pasien: PasienApp, idPerangkat: string) {
  await pool.query("DELETE FROM perangkat WHERE id_perangkat = $1 AND no_rm = $2", [idPerangkat, pasien.no_rm]);
}

// ---------- E-11 / E-12 notifications ----------
export async function notifikasiList(pasien: PasienApp, h: Halaman) {
  const { rows } = await pool.query(
    `SELECT n.* FROM notifikasi n JOIN pendaftaran p ON p.id = n.pendaftaran_id WHERE p.no_rm = $1 ORDER BY n.id DESC LIMIT $2 OFFSET $3`,
    [pasien.no_rm, h.limit + 1, h.offset],
  );
  return {
    rows: rows.map((n) => ({
      id_notifikasi: String(n.id), kategori_notifikasi: "tabulin", jenis_notifikasi: n.templat_kode ?? n.kategori, judul: n.judul, isi: n.isi,
      dibuat_pada: n.dibuat_pada, sudah_dibaca: n.dibaca, layar_tujuan: n.tujuan, id_tujuan: n.tujuan_ref,
    })),
    belumDibaca: await belumDibaca(pasien.no_rm),
  };
}

const tandaiSchema = z.union([
  z.object({ id_notifikasi: z.array(z.string()).min(1, "Pilih minimal satu notifikasi.").max(100) }),
  z.object({ semua: z.literal(true), kategori_notifikasi: z.literal("tabulin").optional() }),
]);

export async function tandaiDibaca(pasien: PasienApp, raw: unknown) {
  const b = tandaiSchema.parse(raw);
  const ids = "id_notifikasi" in b ? b.id_notifikasi.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0) : null;
  await pool.query(
    `UPDATE notifikasi n SET dibaca = true FROM pendaftaran p WHERE p.id = n.pendaftaran_id AND p.no_rm = $1 AND ($2::bigint[] IS NULL OR n.id = ANY($2))`,
    [pasien.no_rm, ids],
  );
  return { jumlah_notifikasi_belum_dibaca: await belumDibaca(pasien.no_rm) };
}
