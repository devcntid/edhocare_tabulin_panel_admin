// Transaction receipt (contract E-09 / BKT-01..05): JSON with a short-lived signed PDF link, plus the PDF itself.
import { ApiError } from "@/lib/api";
import type { PasienApp } from "@/lib/app-api";
import { pool } from "@/lib/db";
import { fmtRp, fmtTgl } from "@/lib/format";
import { TOKEN_BUKTI_DETIK, buatTokenBukti, verifikasiTokenBukti } from "@/lib/pasien-token";
import { buatPdfBukti } from "@/lib/pdf";
import { tagihanDto, transaksiDto } from "@/lib/services/app";

const SELECT_TRX = `
  SELECT t.*, g.nomor AS nomor_tagihan, g.id AS g_id, p.no_rm
  FROM transaksi t JOIN pendaftaran p ON p.id = t.pendaftaran_id LEFT JOIN tagihan g ON g.id = t.tagihan_id`;

const namaBerkas = (nomor: string) => `Bukti-Tabulin-${nomor}.pdf`;

/** E-09. `origin` is the public base of this API, used to build the PDF link. */
export async function receipt(pasien: PasienApp, idTransaksi: string | null, origin: string) {
  if (!idTransaksi?.trim()) throw new ApiError(422, "VALIDATION_ERROR", "Data tidak valid.", { id_transaksi: "Field ini wajib diisi." });
  const t = (await pool.query(`${SELECT_TRX} WHERE t.nomor = $1 AND p.no_rm = $2`, [idTransaksi.trim(), pasien.no_rm])).rows[0];
  if (!t) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  const g = t.g_id ? (await pool.query("SELECT * FROM v_tagihan_status WHERE id = $1", [t.g_id])).rows[0] : null;
  const token = await buatTokenBukti(pasien.no_rm, t.nomor);
  return {
    transaksi: transaksiDto(t),
    tagihan: g ? tagihanDto(g) : null,
    url_bukti_pdf: `${origin}/api/v1/receipt/${encodeURIComponent(t.nomor)}/pdf?token=${token}`,
    nama_berkas_bukti: namaBerkas(t.nomor),
    url_berlaku_sampai: new Date(Date.now() + TOKEN_BUKTI_DETIK * 1000).toISOString(),
  };
}

type Trx = { nomor: string; jenis: string; nominal_transaksi: number; tanggal_bayar: string; tanggal_konfirmasi: string; saldo_setelah: number; nomor_tagihan: string | null };

function susunPdf(t: Trx) {
  return {
    nama: namaBerkas(t.nomor),
    isi: buatPdfBukti({
      judul: "Bukti Transaksi Tabulin",
      subjudul: "Pregnancy Savings+ (Tabungan Ibu Bersalin)",
      baris: [
        { label: "Nomor Referensi", nilai: t.nomor },
        { label: "Jenis", nilai: t.jenis },
        { label: "Nominal", nilai: fmtRp(Number(t.nominal_transaksi)) },
        { label: "Tanggal Transfer", nilai: fmtTgl(t.tanggal_bayar) },
        { label: "Tanggal Konfirmasi", nilai: fmtTgl(t.tanggal_konfirmasi) },
        { label: "Status", nilai: "Terkonfirmasi" },
        { label: "Dana Persalinan Terkumpul Setelah Transaksi", nilai: fmtRp(Number(t.saldo_setelah)) },
        { label: "Tagihan Terkait", nilai: t.nomor_tagihan ?? "-" },
      ],
      catatan: "Contoh bukti, bukan dokumen resmi. Dihasilkan sistem Tabulin.",
    }),
  };
}

/** Public download: valid only with the signed token issued by `receipt()`. */
export async function pdfBuktiDariToken(nomor: string, token: string | null) {
  const v = token ? await verifikasiTokenBukti(token) : null;
  if (!v || v.nomorTransaksi !== nomor) throw new ApiError(401, "BELUM_LOGIN", "Tautan tidak valid atau sudah kedaluwarsa.");
  const t = (await pool.query(`${SELECT_TRX} WHERE t.nomor = $1 AND p.no_rm = $2`, [nomor, v.noRm])).rows[0];
  if (!t) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  return susunPdf(t);
}

/** Admin export of the same receipt. */
export async function pdfBuktiAdmin(transaksiId: number) {
  const t = (await pool.query(`${SELECT_TRX} WHERE t.id = $1`, [transaksiId])).rows[0];
  if (!t) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  return susunPdf(t);
}
