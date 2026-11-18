-- Payment gateway checkout (Midtrans Sandbox). One row per VA charge created for a bill.
-- The ledger is still written only by terima_setoran_api (idempotent on ref_eksternal = order_id); this table
-- tracks the gateway side (charge created, then settled / failed / expired) so a notification can be matched and verified.
CREATE TABLE pembayaran_gateway (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id text NOT NULL UNIQUE,
  penyedia text NOT NULL DEFAULT 'midtrans' CHECK (penyedia IN ('midtrans')),
  pendaftaran_id bigint NOT NULL REFERENCES pendaftaran(id),
  tagihan_id bigint NOT NULL REFERENCES tagihan(id),
  nominal bigint NOT NULL CHECK (nominal > 0),
  bank text NOT NULL,
  nomor_va text NOT NULL,
  id_transaksi_gateway text,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','berhasil','gagal','kedaluwarsa')),
  nomor_transaksi text,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  diperbarui_pada timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON pembayaran_gateway (tagihan_id);
