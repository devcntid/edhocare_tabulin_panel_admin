// Program texts of contract E-01 / PRG-xx. Values marked [ISI] in the contract are owned by Edelweiss (gap G-03, G-22) and are still placeholders.
const ISI = "[ISI oleh Edelweiss]";

export const PROGRAM = {
  nama_menu: "Pregnancy Savings+",
  nama_program: "Tabulin (Tabungan Ibu Bersalin)",
  deskripsi_program: "Menabung biaya persalinan sejak awal kehamilan supaya tidak mendadak menjelang HPL.",
  teks_syarat_ketentuan: ISI,
  versi_syarat_ketentuan: "v1",
  teks_persetujuan: ISI,
  versi_persetujuan: "v1",
  teks_lama_verifikasi: ISI,
  kontak_pmo: ISI,
  teks_waktu_konfirmasi: "paling cepat H+1 hari kerja setelah transfer",
} as const;

// `fitur_klaim_aktif` is not here: it comes from the konfigurasi table (K9 switch, default off).
export const KONFIGURASI_TETAP = {
  rencana_setoran_aktif: true,
  usia_kehamilan_min_minggu: null,
  usia_kehamilan_maks_minggu: null,
  ukuran_maks_bukti_mb: 3,
  tipe_bukti_diizinkan: ["image/jpeg", "image/png", "application/pdf"],
  daftar_bank_asal: ["BCA", "Mandiri", "BRI", "BNI", "BSI", "Bank lain"],
} as const;
