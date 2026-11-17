/** Export of the admin lists to CSV and PDF. Each dataset reuses the list query of its page (same search and filter), without paging. */
import { ApiError } from "@/lib/api";
import { buatCsv, type Sel } from "@/lib/csv";
import { pool } from "@/lib/db";
import { fmtAngka, fmtRp, fmtTgl } from "@/lib/format";
import { buatPdfTabel } from "@/lib/pdf";
import type { Aksi } from "@/lib/permissions";
import { daftarAudit, daftarJadwal, daftarLogApi, daftarNotifikasi, daftarPasien, daftarTagihan, daftarTransaksi } from "@/lib/services/laporan";
import { EKSPOR_MAKS, daftar } from "@/lib/services/pendaftaran";

type Nilai = string | number | null | undefined;
type Kol<T> = { judul: string; nilai: (r: T) => Nilai; tipe?: "uang" | "angka" | "tgl" };
type Hasil<T> = { rows: T[]; total: number };

export type Dataset<T = never> = {
  judul: string;
  izin: Aksi;
  /** Name of the filter query parameter of the page (status, jenis, ...). */
  filter?: string;
  ambil: (q: string | undefined, filter: string | undefined) => Promise<Hasil<T>>;
  kolom: Kol<T>[];
};

const def = <T>(d: Dataset<T>) => d as unknown as Dataset<Record<string, never>>;

export const DATASET: Record<string, Dataset<Record<string, never>>> = {
  pendaftaran: def({
    judul: "Pendaftaran", izin: "lihat", filter: "status",
    ambil: (q, status) => daftar({ q, status, semua: true }),
    kolom: [
      { judul: "No.", nilai: (r) => r.nomor }, { judul: "Nama", nilai: (r) => r.nama }, { judul: "No. RM", nilai: (r) => r.no_rm },
      { judul: "No. HP", nilai: (r) => r.no_hp }, { judul: "Status", nilai: (r) => r.status_pendaftaran }, { judul: "Faskes", nilai: (r) => r.faskes },
      { judul: "Kelas kamar", nilai: (r) => r.kelas_kamar }, { judul: "Cara persalinan", nilai: (r) => r.cara_persalinan },
      { judul: "Saldo", tipe: "uang", nilai: (r) => r.saldo }, { judul: "Dibuat", tipe: "tgl", nilai: (r) => r.dibuat_pada },
    ],
  }),
  pasien: def({
    judul: "Pasien", izin: "lihat",
    ambil: (q) => daftarPasien({ q, semua: true }),
    kolom: [
      { judul: "No. RM", nilai: (r) => r.no_rm }, { judul: "Nama", nilai: (r) => r.nama }, { judul: "No. HP", nilai: (r) => r.no_hp },
      { judul: "Jumlah pendaftaran", tipe: "angka", nilai: (r) => r.jumlah }, { judul: "Status terakhir", nilai: (r) => r.status_terakhir },
      { judul: "Total saldo", tipe: "uang", nilai: (r) => r.total_saldo },
    ],
  }),
  tagihan: def({
    judul: "Tagihan", izin: "lihat", filter: "status",
    ambil: (q, status) => daftarTagihan({ q, status, semua: true }),
    kolom: [
      { judul: "No. tagihan", nilai: (r) => r.nomor }, { judul: "Pendaftaran", nilai: (r) => r.nomor_pendaftaran }, { judul: "Nama", nilai: (r) => r.nama },
      { judul: "Jenis", nilai: (r) => r.jenis }, { judul: "Periode", nilai: (r) => r.periode }, { judul: "Nominal", tipe: "uang", nilai: (r) => r.nominal },
      { judul: "Terbit", tipe: "tgl", nilai: (r) => r.terbit_pada }, { judul: "Jatuh tempo", tipe: "tgl", nilai: (r) => r.jatuh_tempo }, { judul: "Status", nilai: (r) => r.status_tampil },
    ],
  }),
  setoran: def({
    judul: "Setoran", izin: "lihat", filter: "jenis",
    ambil: (q, jenis) => daftarTransaksi({ q, jenis, semua: true }),
    kolom: [
      { judul: "No. transaksi", nilai: (r) => r.nomor }, { judul: "Pendaftaran", nilai: (r) => r.nomor_pendaftaran }, { judul: "Nama", nilai: (r) => r.nama },
      { judul: "Jenis", nilai: (r) => r.jenis }, { judul: "Nominal", tipe: "uang", nilai: (r) => r.nominal_transaksi },
      { judul: "Tanggal bayar", tipe: "tgl", nilai: (r) => r.tanggal_bayar }, { judul: "Tanggal konfirmasi", tipe: "tgl", nilai: (r) => r.tanggal_konfirmasi },
      { judul: "Saldo setelah", tipe: "uang", nilai: (r) => r.saldo_setelah }, { judul: "Keterangan", nilai: (r) => r.keterangan },
    ],
  }),
  "jadwal-cicilan": def({
    judul: "Jadwal cicilan", izin: "lihat", filter: "status",
    ambil: (q, status) => daftarJadwal({ q, status, semua: true }),
    kolom: [
      { judul: "Pendaftaran", nilai: (r) => r.nomor }, { judul: "Nama", nilai: (r) => r.nama }, { judul: "Cicilan ke", tipe: "angka", nilai: (r) => r.urutan },
      { judul: "Dari", tipe: "angka", nilai: (r) => r.jumlah_cicilan }, { judul: "Periode", nilai: (r) => r.periode }, { judul: "Jatuh tempo", tipe: "tgl", nilai: (r) => r.jatuh_tempo },
      { judul: "Nominal", tipe: "uang", nilai: (r) => r.nominal }, { judul: "Status", nilai: (r) => r.status_tampil }, { judul: "No. tagihan", nilai: (r) => r.nomor_tagihan },
    ],
  }),
  notifikasi: def({
    judul: "Notifikasi", izin: "lihat", filter: "kategori",
    ambil: (q, kategori) => daftarNotifikasi({ q, kategori, semua: true }),
    kolom: [
      { judul: "Waktu", tipe: "tgl", nilai: (r) => r.dibuat_pada }, { judul: "Nama", nilai: (r) => r.nama }, { judul: "Kategori", nilai: (r) => r.kategori },
      { judul: "Judul", nilai: (r) => r.judul }, { judul: "Kanal", nilai: (r) => r.kanal }, { judul: "Tujuan", nilai: (r) => r.tujuan }, { judul: "Status kirim", nilai: (r) => r.status_kirim },
    ],
  }),
  "log-api": def({
    judul: "Log setoran API", izin: "lihat", filter: "hasil",
    ambil: (q, hasil) => daftarLogApi({ q, hasil, semua: true }),
    kolom: [
      { judul: "Diterima", tipe: "tgl", nilai: (r) => r.diterima_pada }, { judul: "No. VA", nilai: (r) => r.no_va }, { judul: "Referensi", nilai: (r) => r.referensi },
      { judul: "Tanggal bayar", tipe: "tgl", nilai: (r) => r.tanggal_bayar }, { judul: "Nominal", tipe: "uang", nilai: (r) => r.nominal }, { judul: "Hasil", nilai: (r) => r.hasil },
      { judul: "No. transaksi", nilai: (r) => r.nomor_transaksi }, { judul: "Kode galat", nilai: (r) => r.kode_galat }, { judul: "Pesan", nilai: (r) => r.pesan },
    ],
  }),
  // The audit trail names every admin and what they changed, so only super admin may take it out of the panel.
  audit: def({
    judul: "Audit log", izin: "kelola_pengguna",
    ambil: (q) => daftarAudit({ q, semua: true }),
    kolom: [
      { judul: "Waktu", tipe: "tgl", nilai: (r) => r.dibuat_pada }, { judul: "Admin", nilai: (r) => r.admin_nama }, { judul: "Aksi", nilai: (r) => r.aksi },
      { judul: "Entitas", nilai: (r) => r.entitas }, { judul: "ID", tipe: "angka", nilai: (r) => r.entitas_id },
      { judul: "Detail", nilai: (r) => (r.sesudah ? JSON.stringify(r.sesudah) : null) },
    ],
  }),
};

export const dataset = (nama: string) => {
  const d = Object.hasOwn(DATASET, nama) ? DATASET[nama] : undefined;
  if (!d) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data yang diekspor tidak dikenal.");
  return d;
};

/** CSV timestamps are shown in Jakarta time, not UTC. */
const tglCsv = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(v)));
const tglCsvNilai = (v: Nilai) => (v == null ? "" : tglCsv(String(v)));

export type FileEkspor = { isi: Buffer; tipe: string; nama: string; baris: number };

export async function ekspor(namaDataset: string, o: { format: string; q?: string; filter?: string; adminId: number; hariIni: string }): Promise<FileEkspor> {
  if (o.format !== "csv" && o.format !== "pdf") throw new ApiError(422, "VALIDASI", "Format harus csv atau pdf.", { format: "Pilih csv atau pdf." });
  const d = dataset(namaDataset);
  const { rows, total } = await d.ambil(o.q?.trim() || undefined, o.filter || undefined);
  const nama = `tabulin-${namaDataset}-${o.hariIni}.${o.format}`;
  // an export is data leaving the panel: leave a trail
  await pool.query("SELECT catat_audit($1,'ekspor',$2,NULL,NULL,$3)", [o.adminId, namaDataset, JSON.stringify({ format: o.format, q: o.q || null, filter: o.filter || null, baris: rows.length })]);
  if (o.format === "csv") {
    const csv = buatCsv(d.kolom.map((k) => k.judul), rows.map((r) => d.kolom.map((k): Sel => (k.tipe === "tgl" ? tglCsvNilai(k.nilai(r)) : k.nilai(r)))));
    return { isi: Buffer.from(csv, "utf8"), tipe: "text/csv; charset=utf-8", nama, baris: rows.length };
  }
  const teks = (k: Kol<Record<string, never>>, r: Record<string, never>) => {
    const v = k.nilai(r);
    if (v == null) return "-";
    return k.tipe === "uang" ? fmtRp(Number(v)) : k.tipe === "angka" ? fmtAngka(Number(v)) : k.tipe === "tgl" ? fmtTgl(String(v)) : String(v);
  };
  const potong = total > rows.length ? ` - dibatasi ${fmtAngka(EKSPOR_MAKS)} baris dari ${fmtAngka(total)}` : "";
  const pdf = buatPdfTabel({
    judul: `${d.judul} - RS Edelweiss Tabulin`,
    subjudul: `Diekspor ${fmtTgl(o.hariIni)}${o.q ? ` - pencarian: ${o.q}` : ""}${o.filter ? ` - filter: ${o.filter}` : ""}${potong}`,
    kolom: d.kolom.map((k) => ({ judul: k.judul, kanan: k.tipe === "uang" || k.tipe === "angka" })),
    baris: rows.map((r) => d.kolom.map((k) => teks(k, r))),
  });
  return { isi: pdf, tipe: "application/pdf", nama, baris: rows.length };
}
