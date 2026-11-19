-- Metode pembayaran bisa diurutkan (seret di panel) dan punya gambar/logo. Urutan dipakai panel, aplikasi peserta, dan API instruksi.
-- Gambar disimpan di tabel terpisah supaya snapshot audit (to_jsonb) metode tidak ikut membawa isi berkas.
ALTER TABLE kanal_pembayaran ADD COLUMN urutan int NOT NULL DEFAULT 0;
UPDATE kanal_pembayaran k SET urutan = r.n FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM kanal_pembayaran) r WHERE r.id = k.id;

CREATE TABLE kanal_logo (
  kanal_id bigint PRIMARY KEY REFERENCES kanal_pembayaran(id),
  tipe text NOT NULL CHECK (tipe IN ('image/png','image/jpeg','image/webp')),
  isi bytea NOT NULL CHECK (octet_length(isi) <= 524288),
  diubah_pada timestamptz NOT NULL DEFAULT now()
);
