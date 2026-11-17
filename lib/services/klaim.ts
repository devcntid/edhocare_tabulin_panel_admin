// "Saya sudah bayar" claims (contract E-13 / E-15, KLM-01..11). Behind konfigurasi.fitur_klaim_aktif (K9 undecided, default off).
// A claim only reports a transfer; the balance changes when the deposit arrives (see terima_setoran_api), which settles the claim.
import { z } from "zod";
import { ApiError } from "@/lib/api";
import type { Halaman, PasienApp } from "@/lib/app-api";
import { pool } from "@/lib/db";
import { KONFIGURASI_TETAP } from "@/lib/program";
import { konfig } from "@/lib/services/pendaftaran";

export type KlaimRow = {
  id: number; nomor: string; nomor_tagihan: string; nominal_transfer: number | string; tanggal_transfer: string; bank_asal: string; nama_pengirim: string;
  status: string; alasan_penolakan: string | null; dikirim_pada: string;
};

export const klaimDto = (k: KlaimRow) => ({
  id_klaim: k.nomor, id_tagihan: k.nomor_tagihan, nominal_transfer: Number(k.nominal_transfer), tanggal_transfer: k.tanggal_transfer,
  bank_asal: k.bank_asal, nama_pengirim: k.nama_pengirim, url_file_bukti: null, status_klaim: k.status,
  alasan_penolakan_klaim: k.alasan_penolakan, dikirim_pada: k.dikirim_pada,
});

const KOLOM = `k.id, k.nomor, g.nomor AS nomor_tagihan, k.nominal_transfer, k.tanggal_transfer, k.bank_asal, k.nama_pengirim, k.status, k.alasan_penolakan, k.dikirim_pada`;
const DARI = `klaim_pembayaran k JOIN tagihan g ON g.id = k.tagihan_id`;

async function wajibFitur() {
  if (!(await konfig()).klaimAktif) throw new ApiError(403, "FITUR_TIDAK_AKTIF", "Fitur ini belum tersedia.");
}

// The declared type must match the file's first bytes, so a renamed file cannot slip through.
const TANDA: Record<string, number[]> = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47], "application/pdf": [0x25, 0x50, 0x44, 0x46] };
const cocok = (tipe: string, b: Buffer) => TANDA[tipe]?.every((x, i) => b[i] === x) ?? false;

const formSchema = z.object({
  id_tagihan: z.string("Field ini wajib diisi.").trim().min(1, "Field ini wajib diisi."),
  nominal_transfer: z.coerce.number("Nominal harus berupa angka.").int("Nominal harus bilangan bulat.").positive("Nominal harus lebih dari 0.").max(10_000_000_000),
  tanggal_transfer: z.string("Field ini wajib diisi.").regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
  bank_asal: z.enum(KONFIGURASI_TETAP.daftar_bank_asal, "Bank asal tidak dikenal."),
  nama_pengirim: z.string("Field ini wajib diisi.").trim().min(1, "Field ini wajib diisi.").max(100),
});

/** E-13. `form` is the multipart body; `kunci` the Idempotency-Key header. */
export async function ajukanKlaim(pasien: PasienApp, form: FormData, kunci: string | null) {
  await wajibFitur();
  const parsed = formSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const fields: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) fields[i.path.join(".") || "_"] ??= i.message;
  const berkas = form.get("file_bukti");
  if (!(berkas instanceof File) || berkas.size === 0) fields.file_bukti = "Field ini wajib diisi.";
  if (Object.keys(fields).length) throw new ApiError(422, "VALIDATION_ERROR", "Data tidak valid.", fields);
  const b = parsed.data!;
  const f = berkas as File;
  const tipe = f.type.toLowerCase();
  if (!(KONFIGURASI_TETAP.tipe_bukti_diizinkan as readonly string[]).includes(tipe)) throw new ApiError(415, "TIPE_BERKAS_TIDAK_DIDUKUNG", "Tipe berkas tidak didukung. Gunakan JPG, PNG, atau PDF.");
  if (f.size > KONFIGURASI_TETAP.ukuran_maks_bukti_mb * 1024 * 1024) throw new ApiError(413, "BERKAS_TERLALU_BESAR", `Ukuran berkas maksimal ${KONFIGURASI_TETAP.ukuran_maks_bukti_mb} MB.`);
  const isi = Buffer.from(await f.arrayBuffer());
  if (!cocok(tipe, isi)) throw new ApiError(415, "TIPE_BERKAS_TIDAK_DIDUKUNG", "Isi berkas tidak sesuai tipenya.");

  const p = (await pool.query("SELECT id, status_pendaftaran FROM pendaftaran WHERE no_rm = $1 ORDER BY id DESC LIMIT 1", [pasien.no_rm])).rows[0];
  if (!p || p.status_pendaftaran !== "aktif") throw new ApiError(409, "PENDAFTARAN_TIDAK_AKTIF", "Pendaftaran Tabulin belum aktif.");
  const nama = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "bukti";
  const k = (await pool.query("SELECT id FROM ajukan_klaim($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [p.id, b.id_tagihan, b.nominal_transfer, b.tanggal_transfer, b.bank_asal, b.nama_pengirim, nama, tipe, isi, kunci])).rows[0];
  return klaimDto((await pool.query(`SELECT ${KOLOM} FROM ${DARI} WHERE k.id = $1`, [k.id])).rows[0]);
}

const daftarSchema = z.object({
  id_tagihan: z.string().trim().min(1).optional(),
  status_klaim: z.enum(["menunggu_konfirmasi", "dikonfirmasi", "ditolak"], "Status klaim tidak dikenal.").optional(),
});

/** E-15. Default: every claim except the settled ones (those already show up in the ledger). */
export async function daftarKlaim(pasien: PasienApp, url: URL, h: Halaman) {
  await wajibFitur();
  const q = daftarSchema.parse(Object.fromEntries(url.searchParams));
  const { rows } = await pool.query(
    `SELECT ${KOLOM} FROM ${DARI} JOIN pendaftaran p ON p.id = k.pendaftaran_id
     WHERE p.no_rm = $1 AND ($2::text IS NULL OR g.nomor = $2) AND (($3::text IS NULL AND k.status <> 'dikonfirmasi') OR k.status = $3)
     ORDER BY k.id DESC LIMIT $4 OFFSET $5`,
    [pasien.no_rm, q.id_tagihan ?? null, q.status_klaim ?? null, h.limit + 1, h.offset],
  );
  return rows.map(klaimDto);
}

/** Claims of one bill (contract TGH-10, shown in E-07). Empty while the feature is off. */
export async function klaimTagihan(noRm: string, nomorTagihan: string) {
  if (!(await konfig()).klaimAktif) return [];
  const { rows } = await pool.query(
    `SELECT ${KOLOM} FROM ${DARI} JOIN pendaftaran p ON p.id = k.pendaftaran_id WHERE p.no_rm = $1 AND g.nomor = $2 ORDER BY k.id DESC`, [noRm, nomorTagihan]);
  return rows.map(klaimDto);
}

// ---------- admin side ----------
export async function klaimPendaftaran(pendaftaranId: number) {
  return (await pool.query(`SELECT ${KOLOM}, k.nama_berkas, k.ukuran_berkas FROM ${DARI} WHERE k.pendaftaran_id = $1 ORDER BY k.id DESC`, [pendaftaranId])).rows as (KlaimRow & { nama_berkas: string; ukuran_berkas: number })[];
}

export async function berkasKlaim(id: number) {
  const k = (await pool.query("SELECT nama_berkas, tipe_berkas, isi_berkas FROM klaim_pembayaran WHERE id = $1", [id])).rows[0];
  if (!k) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  return { nama: k.nama_berkas as string, tipe: k.tipe_berkas as string, isi: k.isi_berkas as Buffer };
}
