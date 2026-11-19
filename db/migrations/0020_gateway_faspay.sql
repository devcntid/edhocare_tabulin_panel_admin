-- Faspay lewat payment gateway orchestrator (pay-gate): checkout per tagihan untuk kanal VA, QRIS, e-wallet, dan retail.
-- Setoran tetap hanya ditulis oleh terima_setoran_api (idempotent pada order_id), jadi notifikasi yang terkirim ulang tidak menambah saldo dua kali.
ALTER TABLE pembayaran_gateway DROP CONSTRAINT pembayaran_gateway_penyedia_check;
ALTER TABLE pembayaran_gateway ADD CONSTRAINT pembayaran_gateway_penyedia_check CHECK (penyedia IN ('midtrans','faspay'));
-- QRIS, e-wallet, dan retail tidak punya nomor VA; petunjuk pembayarannya (kode QR, tautan, kode bayar) disimpan apa adanya di `instruksi`.
ALTER TABLE pembayaran_gateway ALTER COLUMN nomor_va DROP NOT NULL;
ALTER TABLE pembayaran_gateway ADD COLUMN kanal_id bigint REFERENCES kanal_pembayaran(id), ADD COLUMN instruksi jsonb, ADD COLUMN kedaluwarsa_pada timestamptz;

-- Jenis pembayaran di gateway (payment_method). Kosong = kanal ini belum bisa dipakai untuk checkout gateway.
ALTER TABLE kanal_pembayaran ADD COLUMN metode_gateway text CHECK (metode_gateway IN ('VA','QRIS','EWALLET','RETAIL'));
UPDATE kanal_pembayaran SET metode_gateway = CASE konfigurasi->>'pg_code'
  WHEN '702' THEN 'VA' WHEN '801' THEN 'VA' WHEN '800' THEN 'VA' WHEN '723' THEN 'VA' WHEN '837' THEN 'VA' WHEN '825' THEN 'VA'
  WHEN '708' THEN 'VA' WHEN '802' THEN 'VA' WHEN '408' THEN 'VA' WHEN '402' THEN 'VA' WHEN '818' THEN 'VA' WHEN '718' THEN 'VA'
  WHEN '836' THEN 'QRIS' WHEN '711' THEN 'QRIS'
  WHEN '812' THEN 'EWALLET' WHEN '302' THEN 'EWALLET' WHEN '716' THEN 'EWALLET' WHEN '713' THEN 'EWALLET' WHEN '844' THEN 'EWALLET'
  WHEN '706' THEN 'RETAIL' WHEN '707' THEN 'RETAIL'
END WHERE konfigurasi ? 'pg_code';
