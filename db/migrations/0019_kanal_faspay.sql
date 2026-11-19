-- Daftar kanal pembayaran gateway (Faspay "Request List of Payment Gateway"). Kode kanal gateway (pg_code) disimpan di konfigurasi, yang tidak pernah dikirim ke peserta.
-- Kanal baru tersembunyi sampai keuangan menampilkannya (Faspay belum tersedia) dan belum punya instruksi. BCA Virtual Account (702) sudah ada sebagai bca_va.
UPDATE kanal_pembayaran SET konfigurasi = konfigurasi || '{"pg_code":"702"}' WHERE kode = 'bca_va';

INSERT INTO kanal_pembayaran (kode, nama, aktif, jenis, konfigurasi, urutan)
SELECT v.kode, v.nama, false, 'va', jsonb_build_object('pg_code', v.pg_code),
       (SELECT coalesce(max(urutan), 0) FROM kanal_pembayaran) + row_number() OVER (ORDER BY v.pg_code)
FROM (VALUES
  ('707', 'alfagroup', 'ALFAGROUP'),
  ('844', 'blu', 'Blu'),
  ('718', 'bnc_va', 'BNC VA'),
  ('801', 'bni_virtual_account', 'BNI Virtual Account'),
  ('800', 'bri_virtual_account', 'BRI Virtual Account'),
  ('723', 'bsi_virtual_account', 'BSI Virtual Account'),
  ('837', 'btn_virtual_account', 'BTN Virtual Account'),
  ('825', 'cimb_va', 'CIMB VA'),
  ('708', 'danamon_va', 'Danamon VA'),
  ('302', 'linkaja', 'LinkAja'),
  ('716', 'linkaja_app', 'Linkaja App'),
  ('802', 'mandiri_virtual_account', 'Mandiri Virtual Account'),
  ('408', 'maybank_virtual_account', 'Maybank Virtual Account'),
  ('812', 'ovo', 'OVO'),
  ('836', 'paydia_qris', 'Paydia QRIS'),
  ('706', 'payment_point_indomaret', 'Payment Point Indomaret'),
  ('402', 'permata', 'Permata'),
  ('713', 'shopeepay_app', 'ShopeePay App'),
  ('711', 'shopeepay_qris', 'ShopeePay QRIS'),
  ('818', 'sinarmas_virtual_account', 'Sinarmas Virtual Account')
) AS v(pg_code, kode, nama)
ON CONFLICT (kode) DO NOTHING;
