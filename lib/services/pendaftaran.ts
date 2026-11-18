import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/lib/db";
import { PAGE_SIZE, PER_HALAMAN, perValid } from "@/lib/paging";
import { ApiError } from "@/lib/api";
import { daftarMaster, paketUntuk, tarifPaket } from "@/lib/services/master";
import { badgeInfo, daysBetween, hitungPaket, nominalTagihan, periodeDefault, periodsAfter, type PaketInfo, type Rencana, type TagihanLite } from "@/lib/services/tabungan";

export const STATUS = ["menunggu_verifikasi", "va_disiapkan", "aktif", "selesai", "ditolak", "kedaluwarsa"] as const;
export { PAGE_SIZE, PER_HALAMAN, perValid };
/** Row cap of one export file. */
export const EKSPOR_MAKS = 10_000;

export type Ringkas = {
  id: number; nomor: string; nama: string; no_rm: string; no_hp: string; status_pendaftaran: (typeof STATUS)[number];
  faskes: string; kelas_kamar: string; cara_persalinan: string; saldo: number; progres_ke_50: number; dibuat_pada: string;
};

export async function daftar(opts: { q?: string; status?: string; page?: number; per?: number; semua?: boolean }) {
  const page = Math.max(1, opts.page ?? 1);
  const per = perValid(opts.per);
  const limit = opts.semua ? EKSPOR_MAKS : per;
  const offset = opts.semua ? 0 : (page - 1) * per;
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.q?.trim()) {
    args.push(`%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(v.nama ILIKE $${args.length} OR v.nomor ILIKE $${args.length} OR v.no_rm ILIKE $${args.length} OR v.no_hp ILIKE $${args.length})`);
  }
  if (opts.status && (STATUS as readonly string[]).includes(opts.status)) {
    args.push(opts.status);
    where.push(`v.status_pendaftaran = $${args.length}`);
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const from = `FROM v_pendaftaran_ringkas v JOIN faskes f ON f.id = v.faskes_id JOIN paket k ON k.id = v.paket_id ${w}`;
  const total = (await pool.query(`SELECT count(*)::int AS n ${from}`, args)).rows[0].n as number;
  const { rows } = await pool.query(
    `SELECT v.id, v.nomor, v.nama, v.no_rm, v.no_hp, v.status_pendaftaran, f.nama AS faskes, k.kelas_kamar, k.cara_persalinan,
            v.saldo, v.progres_ke_50, v.dibuat_pada ${from} ORDER BY v.id DESC LIMIT ${limit} OFFSET ${offset}`,
    args,
  );
  return { rows: rows as Ringkas[], total, page, per, pages: Math.max(1, Math.ceil(total / per)) };
}

export async function konfig(): Promise<{ hari: number; toleransi: number; batasUsia: number; dpPersen: number; targetPersen: number; milestoneMinggu: number; hplMinggu: number; klaimAktif: boolean }> {
  const { rows } = await pool.query("SELECT kunci, nilai FROM konfigurasi");
  const m = Object.fromEntries(rows.map((r) => [r.kunci, Number(r.nilai)]));
  return { hari: m.hari_jatuh_tempo ?? 10, toleransi: m.toleransi_hari ?? 3, batasUsia: m.batas_usia_kehamilan_hari ?? 294, dpPersen: m.dp_persen ?? 20, targetPersen: m.target_persen ?? 50, milestoneMinggu: m.milestone_minggu ?? 28, hplMinggu: m.hpl_minggu ?? 40, klaimAktif: m.fitur_klaim_aktif === 1 };
}

export async function today(): Promise<string> {
  return (await pool.query("SELECT today_jkt()::text AS d")).rows[0].d;
}

export type JadwalBaris = {
  urutan: number; periode: string; jatuh_tempo: string; nominal: number; tagihan_id: number | null;
  nomor_tagihan: string | null; status_tampil: "belum_terbit" | "belum_dibayar" | "lunas" | "lewat_jatuh_tempo";
};
export type Bill = { pendaftaran_id: number; total: number; terbayar: number; sisa: number; jumlah_cicilan: number | null; cicilan_lunas: number };

export async function detail(id: number) {
  const { rows } = await pool.query(
    `SELECT v.*, pd.jumlah_cicilan, f.nama AS faskes, k.kelas_kamar, k.cara_persalinan, k.tier
     FROM v_pendaftaran_ringkas v JOIN pendaftaran pd ON pd.id = v.id
     JOIN faskes f ON f.id = v.faskes_id JOIN paket k ON k.id = v.paket_id WHERE v.id = $1`, [id]);
  const p = rows[0];
  if (!p) throw new ApiError(404, "TIDAK_DITEMUKAN", "Pendaftaran tidak ditemukan.");
  const [tagihan, transaksi, notifikasi, audit, cfg, hariIni, jadwal, bill] = await Promise.all([
    pool.query("SELECT v.*, EXISTS (SELECT 1 FROM pembayaran_gateway pg WHERE pg.tagihan_id = v.id AND pg.status = 'menunggu') AS menunggu_gateway FROM v_tagihan_status v WHERE v.pendaftaran_id = $1 ORDER BY v.periode, v.id", [id]),
    pool.query("SELECT t.*, a.nama AS admin_nama FROM transaksi t LEFT JOIN pengguna_admin a ON a.id = t.dikonfirmasi_oleh WHERE pendaftaran_id = $1 ORDER BY t.id DESC", [id]),
    pool.query("SELECT * FROM notifikasi WHERE pendaftaran_id = $1 ORDER BY id DESC", [id]),
    pool.query(
      `SELECT l.*, a.nama AS admin_nama FROM audit_log l LEFT JOIN pengguna_admin a ON a.id = l.pengguna_id
       WHERE (l.entitas = 'pendaftaran' AND l.entitas_id = $1)
          OR (l.entitas = 'tagihan' AND l.entitas_id IN (SELECT id FROM tagihan WHERE pendaftaran_id = $1))
          OR (l.entitas = 'transaksi' AND l.entitas_id IN (SELECT id FROM transaksi WHERE pendaftaran_id = $1))
       ORDER BY l.id DESC`, [id]),
    konfig(),
    today(),
    pool.query("SELECT * FROM v_jadwal_cicilan WHERE pendaftaran_id = $1 ORDER BY urutan", [id]),
    pool.query("SELECT * FROM v_bill WHERE pendaftaran_id = $1", [id]),
  ]);
  const paket: PaketInfo = p;
  const lite: TagihanLite[] = tagihan.rows.map((t) => ({ ...t, status: t.status_tampil === "menunggu_konfirmasi" ? "menunggu_konfirmasi" : t.status }));
  const usiaHari = daysBetween(p.hpht, hariIni);
  const status = p.status_pendaftaran === "aktif" ? badgeInfo(paket, p.jenis_rencana, p.saldo, lite, hariIni, cfg.hari, cfg.toleransi) : null;
  const periodeBaru = periodeDefault(hariIni, cfg.hari);
  // With an installment schedule the next bill is the first installment not yet issued; legacy registrations use the monthly rule.
  const berikut = (jadwal.rows as JadwalBaris[]).find((j) => !j.tagihan_id);
  const tagihanBaru = p.status_pendaftaran !== "aktif" ? null
    : p.jumlah_cicilan ? (berikut ? { periode: berikut.periode, nominal: berikut.nominal } : null)
    : lite.some((t) => t.periode === periodeBaru) ? null
    : { periode: periodeBaru, nominal: nominalTagihan(paket, p.jenis_rencana as Rencana, periodeBaru, p.saldo, lite, cfg.hari) };
  return {
    pendaftaran: p, tagihan: tagihan.rows, transaksi: transaksi.rows, notifikasi: notifikasi.rows, audit: audit.rows,
    status, usia_kehamilan: { minggu: Math.floor(usiaHari / 7), hari: usiaHari % 7 },
    jadwal: jadwal.rows as JadwalBaris[],
    bill: bill.rows[0] as Bill,
    tagihan_baru: tagihanBaru,
    hari_ini: hariIni,
  };
}

export function cekHpht(hpht: string, hariIni: string, batasUsia: number) {
  if (hpht > hariIni) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { hpht: "HPHT tidak boleh melewati hari ini." });
  if (daysBetween(hpht, hariIni) > batasUsia) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { hpht: "HPHT lebih dari 42 minggu yang lalu. Periksa kembali tanggalnya." });
}

export const buatSchema = z.object({
  no_rm: z.string().trim().min(1, "Pilih pasien.").max(30),
  faskes_id: z.coerce.number().int().positive("Field ini wajib diisi."),
  cara_persalinan: z.string().trim().min(1, "Pilih cara persalinan."),
  kelas_kamar: z.string().trim().min(1, "Pilih kelas kamar."),
  jumlah_cicilan: z.coerce.number().int("Harus bilangan bulat.").min(1, "Minimal 1 kali.").max(24, "Maksimal 24 kali."),
  hpht: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Field ini wajib diisi."),
});

/** Everything `buat` checks and computes before the INSERT. Shared with the CSV import, which validates a whole file before writing any row. */
export async function siapkan(input: z.infer<typeof buatSchema>) {
  const cfg = await konfig();
  const hariIni = await today();
  cekHpht(input.hpht, hariIni, cfg.batasUsia);
  const pasien = (await pool.query("SELECT nama, no_hp FROM pasien WHERE no_rm = $1", [input.no_rm])).rows[0] as { nama: string; no_hp: string } | undefined;
  if (!pasien) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { no_rm: "Pasien tidak ditemukan di data pasien." });
  const [cara, kelas] = await Promise.all([
    pool.query("SELECT 1 FROM opsi_cara_persalinan WHERE nama = $1 AND aktif", [input.cara_persalinan]),
    pool.query("SELECT 1 FROM opsi_kelas_kamar WHERE nama = $1 AND aktif", [input.kelas_kamar]),
  ]);
  if (!cara.rowCount) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { cara_persalinan: "Cara persalinan tidak tersedia." });
  if (!kelas.rowCount) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { kelas_kamar: "Kelas kamar tidak tersedia." });
  const total = await tarifPaket(input.faskes_id, input.cara_persalinan, input.kelas_kamar);
  if (total == null) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { faskes_id: "Harga belum diatur untuk faskes ini." });
  const paket = (await paketUntuk(input.cara_persalinan, input.kelas_kamar))!;
  const pk = { tarif_total: total, setoran_min_bulanan: Number(paket.setoran_min_bulanan) };
  const n = hitungPaket(Number(pk.tarif_total), input.hpht, cfg.dpPersen, cfg.targetPersen, cfg.milestoneMinggu, cfg.hplMinggu);
  const sisa = Number(pk.tarif_total) - n.dp;
  const bulan = periodsAfter(hariIni, n.perkiraan_hpl, cfg.hari).length;
  if (input.jumlah_cicilan > bulan) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { jumlah_cicilan: `Maksimal ${bulan} kali agar lunas sebelum perkiraan HPL.` });
  const per = Math.floor(sisa / input.jumlah_cicilan / 1000) * 1000;
  if (per < Number(pk.setoran_min_bulanan)) {
    throw new ApiError(422, "VALIDASI", "Data tidak valid.", { jumlah_cicilan: `Cicilan Rp${new Intl.NumberFormat("id-ID").format(per)} di bawah setoran minimum paket Rp${new Intl.NumberFormat("id-ID").format(Number(pk.setoran_min_bulanan))}. Kurangi jumlah cicilan.` });
  }
  return { input, pasien, paketId: paket.id as number, pk, n };
}

export type Siap = Awaited<ReturnType<typeof siapkan>>;

/** Writes one prepared registration inside the caller's transaction. */
export async function sisip(c: PoolClient, p: Siap, adminId: number) {
  const { input, pasien, pk, n } = p;
  try {
    // savepoint: a failed INSERT must not abort the caller's whole transaction before it can report which row failed
    await c.query("SAVEPOINT sisip_pendaftaran");
    const { rows } = await c.query(
      `INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, jumlah_cicilan, hpht, tanggal_milestone, perkiraan_hpl, tarif_total, dp, target_50, setoran_min_bulanan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [pasien.nama, input.no_rm, pasien.no_hp, input.faskes_id, p.paketId, input.jumlah_cicilan, input.hpht,
       n.tanggal_milestone, n.perkiraan_hpl, pk.tarif_total, n.dp, n.target_50, pk.setoran_min_bulanan],
    );
    await c.query("SELECT catat_audit($1,'buat','pendaftaran',$2,NULL,$3)", [adminId, rows[0].id, JSON.stringify({ nama: pasien.nama, no_rm: input.no_rm })]);
    await c.query("RELEASE SAVEPOINT sisip_pendaftaran");
    return rows[0].id as number;
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT sisip_pendaftaran");
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "DUPLIKAT", "No. RM ini sudah memiliki pendaftaran yang berjalan.", { no_rm: "Sudah terdaftar." });
    if ((e as { code?: string }).code === "23503") throw new ApiError(422, "VALIDASI", "Data tidak valid.", { faskes_id: "Faskes tidak ditemukan." });
    throw e;
  }
}

export async function buat(input: z.infer<typeof buatSchema>, adminId: number) {
  const siap = await siapkan(input);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const id = await sisip(c, siap, adminId);
    await c.query("COMMIT");
    return { id };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export type OpsiPasien = { no_rm: string; nama: string; no_hp: string; berjalan: boolean };
export type OpsiHarga = { nama: string; harga: Record<number, number> };

export async function opsiForm() {
  const [m, pasien] = await Promise.all([
    daftarMaster(),
    pool.query(`SELECT p.no_rm, p.nama, p.no_hp,
                       EXISTS (SELECT 1 FROM pendaftaran d WHERE d.no_rm = p.no_rm AND d.status_pendaftaran NOT IN ('ditolak','kedaluwarsa')) AS berjalan
                FROM pasien p ORDER BY p.nama`),
  ]);
  return {
    faskes: m.faskes.map((f) => ({ id: f.id, nama: f.nama })),
    cara: m.cara.filter((c) => c.aktif).map((c) => ({ nama: c.nama, harga: c.harga })) as OpsiHarga[],
    kelas: m.kelas.filter((k) => k.aktif).map((k) => ({ nama: k.nama, harga: k.harga, tier: k.tier, setoran_min_bulanan: k.setoran_min_bulanan })) as (OpsiHarga & { tier: string; setoran_min_bulanan: number })[],
    pasien: pasien.rows as OpsiPasien[],
  };
}

const setoranSchema = z.object({
  tanggal_bayar: z.string("Field ini wajib diisi.").regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
  nominal: z.coerce.number("Nominal harus berupa angka.").int("Nominal harus bilangan bulat.").positive("Nominal harus lebih dari 0.").max(10_000_000_000),
  tagihan_id: z.number().int().positive().nullable().optional(),
  kanal_id: z.number("Pilih metode pembayaran.").int().positive("Pilih metode pembayaran."),
});

/** Manual deposit confirmation by finance (bank transfer or cash, checked the next day; kanal_id = the method used). Rules (H+1, under-payment, ownership of the bill) live in konfirmasi_setoran. */
export async function konfirmasiSetoranManual(id: number, raw: unknown, adminId: number) {
  const b = setoranSchema.parse(raw);
  return panggil("konfirmasi_setoran", [id, b.tanggal_bayar, b.nominal, b.tagihan_id ?? null, adminId, b.kanal_id]);
}

/** Run a DB state-transition function and return its row. */
export async function panggil(fn: string, args: unknown[]) {
  const ph = args.map((_, i) => `$${i + 1}`).join(",");
  return (await pool.query(`SELECT * FROM ${fn}(${ph})`, args)).rows[0];
}
