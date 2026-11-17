-- Reference data: config defaults, faskes, 24 package tariffs (BRD §3 / §2.2; see docs/05).
INSERT INTO konfigurasi (kunci, nilai) VALUES
  ('milestone_minggu', '28'), ('hpl_minggu', '40'), ('dp_persen', '20'), ('target_persen', '50'),
  ('hari_jatuh_tempo', '10'), ('hari_tempo_dp', '7'), ('toleransi_hari', '3'), ('batas_usia_kehamilan_hari', '294');

INSERT INTO faskes (kode, nama) VALUES
  ('BDG', 'RS Edelweiss Bandung'), ('CJR', 'RS Edelweiss Cianjur');

INSERT INTO paket (kelas_kamar, cara_persalinan, tarif_total, setoran_min_bulanan, tier)
SELECT k.kelas, c.cara, k.tarif[c.ord], k.minimum,
       CASE WHEN k.kelas LIKE 'Kelas %' THEN 'Saving+ Essential' ELSE 'Saving+ Premium' END
FROM (VALUES
  ('Suite',        ARRAY[54000000,58000000,27000000]::bigint[], 5000000::bigint),
  ('Junior Suite', ARRAY[54000000,58000000,27000000]::bigint[], 5000000::bigint),
  ('VIP A',        ARRAY[49000000,52000000,24000000]::bigint[], 2000000::bigint),
  ('VIP B',        ARRAY[45000000,47000000,20500000]::bigint[], 2000000::bigint),
  ('VIP C',        ARRAY[40500000,42500000,18000000]::bigint[], 2000000::bigint),
  ('Kelas 1',      ARRAY[35000000,37500000,15000000]::bigint[], 1000000::bigint),
  ('Kelas 2',      ARRAY[31000000,34500000,13000000]::bigint[], 1000000::bigint),
  ('Kelas 3',      ARRAY[27000000,29000000,11500000]::bigint[], 1000000::bigint)
) AS k(kelas, tarif, minimum)
CROSS JOIN (VALUES ('Caesar Konvensional', 1), ('Caesar ERACS', 2), ('Partus Normal', 3)) AS c(cara, ord);

INSERT INTO templat_notifikasi (kode, nama, kategori, judul, isi, tujuan, variabel) VALUES
 ('pendaftaran_disetujui', 'Pendaftaran disetujui', 'pendaftaran', 'Pendaftaran disetujui',
  'Halo {{nama}}, pendaftaran Tabulin Anda disetujui. Nomor Virtual Account sedang disiapkan.', 'pendaftaran', '{nama}'),
 ('pendaftaran_ditolak', 'Pendaftaran ditolak', 'pendaftaran', 'Pendaftaran belum disetujui',
  'Halo {{nama}}, pendaftaran Tabulin Anda belum dapat disetujui. Buka aplikasi untuk detailnya.', 'pendaftaran', '{nama}'),
 ('va_tersedia', 'Nomor VA tersedia', 'pendaftaran', 'Nomor VA tersedia',
  'Nomor Virtual Account {{bank}} Anda sudah tersedia.', 'pendaftaran', '{nama,bank,nomor_va}'),
 ('tagihan_dp_terbit', 'Tagihan DP terbit', 'tagihan', 'Tagihan DP terbit',
  'Tagihan DP Tabulin Anda sudah terbit. Jatuh tempo {{jatuh_tempo}}.', 'tagihan', '{nama,nomor_tagihan,nominal_tagihan,jatuh_tempo}'),
 ('tagihan_bulanan_terbit', 'Tagihan bulanan terbit', 'tagihan', 'Tagihan {{periode}} terbit',
  'Tagihan setoran bulanan Anda sudah terbit. Buka aplikasi untuk detailnya.', 'tagihan', '{nama,periode,nomor_tagihan,nominal_tagihan,jatuh_tempo}'),
 ('pengingat_jatuh_tempo', 'Pengingat jatuh tempo', 'tagihan', 'Tagihan {{nomor_tagihan}} segera jatuh tempo',
  'Halo {{nama}}, tagihan {{nomor_tagihan}} jatuh tempo pada {{jatuh_tempo}}. Mohon lakukan setoran melalui Virtual Account Anda.', 'tagihan', '{nama,nomor_tagihan,nominal_tagihan,jatuh_tempo}'),
 ('tagihan_terlambat', 'Tagihan terlambat', 'tagihan', 'Tagihan {{nomor_tagihan}} melewati jatuh tempo',
  'Halo {{nama}}, tagihan {{nomor_tagihan}} sudah melewati jatuh tempo ({{jatuh_tempo}}). Mohon segera lakukan setoran.', 'tagihan', '{nama,nomor_tagihan,nominal_tagihan,jatuh_tempo}'),
 ('pembayaran_terkonfirmasi', 'Pembayaran terkonfirmasi', 'pembayaran', 'Pembayaran terkonfirmasi',
  'Setoran Tabulin Anda sudah kami terima.', 'transaksi', '{nama,nomor_transaksi,nominal,saldo}'),
 ('target_50_tercapai', 'Target 50% tercapai', 'milestone', 'Target 50% tercapai',
  'Selamat {{nama}}, tabungan Anda sudah mencapai 50% dari tarif paket.', 'dasbor', '{nama,saldo,target}');

INSERT INTO kanal_pembayaran (kode, nama, deskripsi, aktif) VALUES
 ('bca_va', 'Virtual Account BCA', 'Transfer ke nomor Virtual Account BCA milik peserta. Setoran dilaporkan ke sistem lewat API.', true),
 ('qris', 'QRIS', 'Belum disetujui oleh RS.', false),
 ('tunai', 'Tunai', 'Belum disetujui oleh RS.', false);
INSERT INTO instruksi_pembayaran (kanal_id, judul, isi, nama_bank, urutan)
SELECT id, 'Cara setor lewat Virtual Account BCA',
       'Buka m-BCA / ATM BCA, pilih Transfer > BCA Virtual Account, masukkan nomor VA Anda, lalu masukkan nominal setoran. Simpan bukti transfer.', 'BCA', 1
FROM kanal_pembayaran WHERE kode = 'bca_va';
