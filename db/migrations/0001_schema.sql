-- Tabulin admin panel schema (design v3). Contract names: Indonesian snake_case.
-- Money: BIGINT rupiah. Dates: DATE in Asia/Jakarta. Ledger is append-only.

CREATE FUNCTION today_jkt() RETURNS date LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date $$;

CREATE TABLE konfigurasi (
  kunci text PRIMARY KEY,
  nilai jsonb NOT NULL
);

CREATE TABLE pengguna_admin (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  nama text NOT NULL,
  peran text NOT NULL CHECK (peran IN ('super_admin','admin_program','keuangan')),
  password_hash text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE faskes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kode text NOT NULL UNIQUE,
  nama text NOT NULL,
  aktif boolean NOT NULL DEFAULT true
);

CREATE TABLE paket (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelas_kamar text NOT NULL,
  cara_persalinan text NOT NULL CHECK (cara_persalinan IN ('Caesar Konvensional','Caesar ERACS','Partus Normal')),
  tarif_total bigint NOT NULL CHECK (tarif_total > 0),
  setoran_min_bulanan bigint NOT NULL CHECK (setoran_min_bulanan > 0),
  tier text NOT NULL CHECK (tier IN ('Saving+ Premium','Saving+ Essential')),
  UNIQUE (kelas_kamar, cara_persalinan)
);

CREATE SEQUENCE pendaftaran_seq;
CREATE SEQUENCE transaksi_seq;
CREATE SEQUENCE va_seq START 1;

CREATE TABLE pendaftaran (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nomor text NOT NULL UNIQUE
    DEFAULT ('TBL-' || to_char(today_jkt(), 'YYYY') || '-' || lpad(nextval('pendaftaran_seq')::text, 4, '0')),
  nama text NOT NULL CHECK (length(btrim(nama)) > 0),
  no_rm text NOT NULL,
  no_hp text NOT NULL CHECK (no_hp ~ '^[0-9]{10,13}$'),
  faskes_id bigint NOT NULL REFERENCES faskes(id),
  paket_id bigint NOT NULL REFERENCES paket(id),
  hpht date NOT NULL,
  tanggal_milestone date NOT NULL,
  perkiraan_hpl date NOT NULL,
  jenis_rencana text NOT NULL DEFAULT 'minimum' CHECK (jenis_rencana IN ('minimum','disarankan')),
  persetujuan_versi text NOT NULL DEFAULT 'v1',
  persetujuan_pada timestamptz NOT NULL DEFAULT now(),
  -- snapshot of package numbers at registration
  tarif_total bigint NOT NULL CHECK (tarif_total > 0),
  dp bigint NOT NULL CHECK (dp > 0),
  target_50 bigint NOT NULL CHECK (target_50 > 0),
  setoran_min_bulanan bigint NOT NULL CHECK (setoran_min_bulanan > 0),
  status_pendaftaran text NOT NULL DEFAULT 'menunggu_verifikasi'
    CHECK (status_pendaftaran IN ('menunggu_verifikasi','va_disiapkan','aktif','selesai','ditolak','kedaluwarsa')),
  alasan_penolakan text,
  diputuskan_pada timestamptz,
  bank_va text NOT NULL DEFAULT 'BCA',
  no_va text UNIQUE,
  nama_va text,
  selesai_pada timestamptz,
  total_setoran bigint,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  CHECK (status_pendaftaran <> 'ditolak' OR alasan_penolakan IS NOT NULL),
  CHECK (status_pendaftaran NOT IN ('aktif','selesai') OR no_va IS NOT NULL),
  CHECK (status_pendaftaran <> 'selesai' OR selesai_pada IS NOT NULL)
);
CREATE INDEX ON pendaftaran (status_pendaftaran);
-- one live registration per patient (No. RM); rejected/expired may re-register
CREATE UNIQUE INDEX pendaftaran_satu_aktif ON pendaftaran (no_rm)
  WHERE status_pendaftaran NOT IN ('ditolak','kedaluwarsa');

CREATE TABLE tagihan (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pendaftaran_id bigint NOT NULL REFERENCES pendaftaran(id),
  nomor text NOT NULL UNIQUE,
  jenis text NOT NULL CHECK (jenis IN ('dp','bulanan')),
  periode text NOT NULL CHECK (periode ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  nominal bigint NOT NULL CHECK (nominal > 0),
  terbit_pada date NOT NULL,
  jatuh_tempo date NOT NULL CHECK (jatuh_tempo >= terbit_pada),
  status text NOT NULL DEFAULT 'belum_dibayar' CHECK (status IN ('belum_dibayar','lunas')),
  ref_transaksi text,
  UNIQUE (pendaftaran_id, periode)
);
CREATE UNIQUE INDEX tagihan_satu_dp ON tagihan (pendaftaran_id) WHERE jenis = 'dp';

CREATE TABLE transaksi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nomor text NOT NULL UNIQUE,
  pendaftaran_id bigint NOT NULL REFERENCES pendaftaran(id),
  tagihan_id bigint REFERENCES tagihan(id),
  koreksi_dari bigint REFERENCES transaksi(id),
  jenis text NOT NULL CHECK (jenis IN ('DP','Setoran bulanan','Setoran bulanan + tambahan','Setoran tambahan','Koreksi')),
  nominal_transaksi bigint NOT NULL CHECK (nominal_transaksi <> 0),
  tanggal_bayar date NOT NULL,
  tanggal_konfirmasi timestamptz NOT NULL DEFAULT now(),
  saldo_setelah bigint NOT NULL CHECK (saldo_setelah >= 0),
  keterangan text,
  dikonfirmasi_oleh bigint REFERENCES pengguna_admin(id),
  CHECK ((jenis = 'Koreksi') = (koreksi_dari IS NOT NULL)),
  CHECK ((jenis = 'Koreksi') = (nominal_transaksi < 0))
);
CREATE INDEX ON transaksi (pendaftaran_id, id);
-- a transaction can be corrected only once
CREATE UNIQUE INDEX transaksi_satu_koreksi ON transaksi (koreksi_dari) WHERE koreksi_dari IS NOT NULL;

CREATE TABLE notifikasi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pendaftaran_id bigint NOT NULL REFERENCES pendaftaran(id),
  kategori text NOT NULL CHECK (kategori IN ('pendaftaran','tagihan','pembayaran','milestone')),
  judul text NOT NULL,
  isi text NOT NULL,
  tujuan text NOT NULL,
  tujuan_ref text,
  dibaca boolean NOT NULL DEFAULT false,
  -- delivery log (local version: mock delivery, recorded only)
  templat_kode text,
  kanal text NOT NULL DEFAULT 'push' CHECK (kanal IN ('push','whatsapp','sms','email')),
  status_kirim text NOT NULL DEFAULT 'tercatat' CHECK (status_kirim IN ('tercatat','terkirim','gagal')),
  galat text,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notifikasi (pendaftaran_id, id DESC);
-- the "target 50% tercapai" notice is sent once per registration, ever
CREATE UNIQUE INDEX notifikasi_milestone_sekali ON notifikasi (pendaftaran_id) WHERE kategori = 'milestone';

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pengguna_id bigint REFERENCES pengguna_admin(id),
  aksi text NOT NULL,
  entitas text NOT NULL,
  entitas_id bigint,
  sebelum jsonb,
  sesudah jsonb,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (entitas, entitas_id);

-- append-only guards
CREATE FUNCTION tolak_ubah() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY: % pada % tidak diizinkan', TG_OP, TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$;
CREATE TRIGGER transaksi_append_only BEFORE UPDATE OR DELETE ON transaksi FOR EACH ROW EXECUTE FUNCTION tolak_ubah();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION tolak_ubah();

-- registration status can only move along the lifecycle
CREATE FUNCTION jaga_status_pendaftaran() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status_pendaftaran = OLD.status_pendaftaran THEN RETURN NEW; END IF;
  IF (OLD.status_pendaftaran, NEW.status_pendaftaran) NOT IN (
    ('menunggu_verifikasi','va_disiapkan'), ('menunggu_verifikasi','ditolak'), ('menunggu_verifikasi','kedaluwarsa'),
    ('va_disiapkan','aktif'), ('aktif','selesai')) THEN
    RAISE EXCEPTION 'STATUS_TIDAK_VALID: % -> %', OLD.status_pendaftaran, NEW.status_pendaftaran USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pendaftaran_status BEFORE UPDATE ON pendaftaran FOR EACH ROW EXECUTE FUNCTION jaga_status_pendaftaran();

-- views
CREATE VIEW v_saldo AS
  SELECT p.id AS pendaftaran_id, COALESCE(sum(t.nominal_transaksi), 0)::bigint AS saldo
  FROM pendaftaran p LEFT JOIN transaksi t ON t.pendaftaran_id = p.id
  GROUP BY p.id;

CREATE VIEW v_tagihan_status AS
  SELECT g.*,
    CASE WHEN g.status = 'belum_dibayar' AND g.jatuh_tempo < today_jkt() THEN 'lewat_jatuh_tempo' ELSE g.status END AS status_tampil
  FROM tagihan g;

CREATE VIEW v_pendaftaran_ringkas AS
  SELECT p.*, s.saldo,
    round(s.saldo * 100.0 / p.target_50, 1) AS progres_ke_50,
    round(s.saldo * 100.0 / p.tarif_total, 1) AS progres_ke_100,
    greatest(0, p.target_50 - s.saldo)::bigint AS sisa_ke_target_50
  FROM pendaftaran p JOIN v_saldo s ON s.pendaftaran_id = p.id;

-- Notification templates: {{variable}} placeholders are rendered when a notification is created; the rendered text is snapshotted in notifikasi.
CREATE TABLE templat_notifikasi (
  kode text PRIMARY KEY,
  nama text NOT NULL,
  kategori text NOT NULL CHECK (kategori IN ('pendaftaran','tagihan','pembayaran','milestone')),
  judul text NOT NULL CHECK (length(btrim(judul)) > 0),
  isi text NOT NULL CHECK (length(btrim(isi)) > 0),
  tujuan text NOT NULL,
  variabel text[] NOT NULL DEFAULT '{}',
  aktif boolean NOT NULL DEFAULT true,
  diubah_pada timestamptz NOT NULL DEFAULT now()
);

-- Payment methods and the customer-facing instructions attached to them.
CREATE TABLE kanal_pembayaran (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kode text NOT NULL UNIQUE CHECK (kode ~ '^[a-z0-9_]+$'),
  nama text NOT NULL,
  deskripsi text,
  aktif boolean NOT NULL DEFAULT true,
  konfigurasi jsonb NOT NULL DEFAULT '{}'   -- internal only, never exposed to customers
);
CREATE TABLE instruksi_pembayaran (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kanal_id bigint NOT NULL REFERENCES kanal_pembayaran(id),
  judul text NOT NULL,
  isi text NOT NULL,
  nama_bank text,
  nama_rekening text,
  nomor_rekening text,
  urutan int NOT NULL DEFAULT 0,
  aktif boolean NOT NULL DEFAULT true
);

-- Every deposit report received from the customer app / bank API, including refused ones (payment event log).
CREATE TABLE log_setoran_api (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  diterima_pada timestamptz NOT NULL DEFAULT now(),
  no_va text,
  referensi text,
  nominal bigint,
  tanggal_bayar text,
  hasil text NOT NULL CHECK (hasil IN ('diterima','duplikat','ditolak')),
  kode_galat text,
  pesan text,
  nomor_transaksi text
);
CREATE INDEX ON log_setoran_api (id DESC);
CREATE TRIGGER log_setoran_append_only BEFORE UPDATE OR DELETE ON log_setoran_api FOR EACH ROW EXECUTE FUNCTION tolak_ubah();
