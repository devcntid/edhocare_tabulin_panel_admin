-- "Saya sudah bayar" claims (contract E-13 / E-15, KLM-01..11). The feature stays off until konfigurasi.fitur_klaim_aktif = 1 (K9 is undecided).
-- A claim never changes the balance: the ledger only changes when the deposit arrives (terima_setoran_api / konfirmasi_setoran), which also settles the claim.
CREATE SEQUENCE klaim_seq;
CREATE TABLE klaim_pembayaran (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nomor text NOT NULL UNIQUE,
  pendaftaran_id bigint NOT NULL REFERENCES pendaftaran(id),
  tagihan_id bigint NOT NULL REFERENCES tagihan(id),
  nominal_transfer bigint NOT NULL CHECK (nominal_transfer > 0),
  tanggal_transfer date NOT NULL,
  bank_asal text NOT NULL CHECK (length(btrim(bank_asal)) > 0),
  nama_pengirim text NOT NULL CHECK (length(btrim(nama_pengirim)) > 0),
  nama_berkas text NOT NULL,
  tipe_berkas text NOT NULL,
  ukuran_berkas int NOT NULL CHECK (ukuran_berkas > 0),
  isi_berkas bytea NOT NULL,
  status text NOT NULL DEFAULT 'menunggu_konfirmasi' CHECK (status IN ('menunggu_konfirmasi','dikonfirmasi','ditolak')),
  alasan_penolakan text,
  kunci_idempotensi text,
  dikirim_pada timestamptz NOT NULL DEFAULT now(),
  diputuskan_pada timestamptz,
  diputuskan_oleh bigint REFERENCES pengguna_admin(id),
  CHECK (status <> 'ditolak' OR alasan_penolakan IS NOT NULL)
);
CREATE UNIQUE INDEX klaim_satu_menunggu ON klaim_pembayaran (tagihan_id) WHERE status = 'menunggu_konfirmasi';
CREATE UNIQUE INDEX klaim_kunci ON klaim_pembayaran (pendaftaran_id, kunci_idempotensi) WHERE kunci_idempotensi IS NOT NULL;
CREATE INDEX ON klaim_pembayaran (pendaftaran_id, id DESC);

INSERT INTO konfigurasi (kunci, nilai) VALUES ('fitur_klaim_aktif', to_jsonb(0));

-- Bill shown as "menunggu_konfirmasi" while a claim is pending; a rejected or settled claim falls back to the normal status (derived, never stored).
CREATE OR REPLACE VIEW v_tagihan_status AS
  SELECT g.*,
    CASE WHEN g.status = 'belum_dibayar' AND EXISTS (SELECT 1 FROM klaim_pembayaran k WHERE k.tagihan_id = g.id AND k.status = 'menunggu_konfirmasi') THEN 'menunggu_konfirmasi'
         WHEN g.status = 'belum_dibayar' AND g.jatuh_tempo < today_jkt() THEN 'lewat_jatuh_tempo'
         ELSE g.status END AS status_tampil
  FROM tagihan g;

INSERT INTO templat_notifikasi (kode, nama, kategori, judul, isi, tujuan, variabel) VALUES
 ('pembayaran_diproses', 'Laporan transfer diterima', 'pembayaran', 'Laporan transfer diterima',
  'Laporan transfer untuk tagihan {{nomor_tagihan}} sudah kami terima. Dana Persalinan Terkumpul bertambah setelah dikonfirmasi tim keuangan.', 'tagihan', '{nama,nomor_tagihan}'),
 ('klaim_ditolak', 'Laporan transfer ditolak', 'pembayaran', 'Laporan transfer belum dapat dikonfirmasi',
  'Halo {{nama}}, laporan transfer untuk tagihan {{nomor_tagihan}} belum dapat dikonfirmasi. Buka aplikasi untuk detailnya.', 'tagihan', '{nama,nomor_tagihan}');

CREATE FUNCTION ajukan_klaim(p_pend bigint, p_nomor_tagihan text, p_nominal bigint, p_tanggal date, p_bank text, p_nama text,
                             p_berkas_nama text, p_tipe text, p_isi bytea, p_kunci text)
RETURNS klaim_pembayaran LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; g tagihan; k klaim_pembayaran;
BEGIN
  r := kunci_pendaftaran(p_pend, ARRAY['aktif']);
  IF p_kunci IS NOT NULL THEN
    SELECT * INTO k FROM klaim_pembayaran WHERE pendaftaran_id = p_pend AND kunci_idempotensi = p_kunci;
    IF FOUND THEN RETURN k; END IF;
  END IF;
  SELECT * INTO g FROM tagihan WHERE nomor = p_nomor_tagihan AND pendaftaran_id = p_pend FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: tagihan' USING ERRCODE = 'P0001'; END IF;
  IF g.status = 'lunas' THEN RAISE EXCEPTION 'TAGIHAN_SUDAH_LUNAS: %', g.nomor USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM klaim_pembayaran WHERE tagihan_id = g.id AND status = 'menunggu_konfirmasi') THEN
    RAISE EXCEPTION 'KLAIM_SUDAH_ADA: sudah ada laporan transfer yang menunggu konfirmasi untuk %', g.nomor USING ERRCODE = 'P0001';
  END IF;
  IF p_nominal IS NULL OR p_nominal <= 0 THEN RAISE EXCEPTION 'NOMINAL_TIDAK_VALID: nominal harus > 0' USING ERRCODE = 'P0001'; END IF;
  IF p_tanggal IS NULL OR p_tanggal > today_jkt() THEN RAISE EXCEPTION 'TANGGAL_TIDAK_VALID: tanggal transfer tidak boleh di masa depan' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO klaim_pembayaran (nomor, pendaftaran_id, tagihan_id, nominal_transfer, tanggal_transfer, bank_asal, nama_pengirim, nama_berkas, tipe_berkas, ukuran_berkas, isi_berkas, kunci_idempotensi)
    VALUES ('KLM-' || lpad(nextval('klaim_seq')::text, 4, '0'), p_pend, g.id, p_nominal, p_tanggal, btrim(p_bank), btrim(p_nama), p_berkas_nama, p_tipe, length(p_isi), p_isi, p_kunci)
    RETURNING * INTO k;
  PERFORM kirim_templat(p_pend, 'pembayaran_diproses', jsonb_build_object('nama', r.nama, 'nomor_tagihan', g.nomor), g.nomor);
  PERFORM catat_audit(NULL, 'ajukan', 'klaim_pembayaran', k.id, NULL, to_jsonb(k) - 'isi_berkas');
  RETURN k;
END $$;

CREATE FUNCTION tolak_klaim(p_id bigint, p_alasan text, p_admin bigint) RETURNS klaim_pembayaran LANGUAGE plpgsql AS $$
DECLARE k klaim_pembayaran; r pendaftaran; g tagihan;
BEGIN
  IF p_alasan IS NULL OR length(btrim(p_alasan)) = 0 THEN RAISE EXCEPTION 'ALASAN_WAJIB: alasan penolakan wajib diisi' USING ERRCODE = 'P0001'; END IF;
  SELECT pendaftaran_id INTO k.pendaftaran_id FROM klaim_pembayaran WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: klaim' USING ERRCODE = 'P0001'; END IF;
  r := kunci_pendaftaran(k.pendaftaran_id, ARRAY['aktif']);
  SELECT * INTO k FROM klaim_pembayaran WHERE id = p_id FOR UPDATE;
  IF k.status <> 'menunggu_konfirmasi' THEN RAISE EXCEPTION 'KLAIM_TIDAK_VALID: klaim sudah %', k.status USING ERRCODE = 'P0001'; END IF;
  UPDATE klaim_pembayaran SET status = 'ditolak', alasan_penolakan = btrim(p_alasan), diputuskan_pada = now(), diputuskan_oleh = p_admin WHERE id = p_id RETURNING * INTO k;
  SELECT * INTO g FROM tagihan WHERE id = k.tagihan_id;
  PERFORM kirim_templat(k.pendaftaran_id, 'klaim_ditolak', jsonb_build_object('nama', r.nama, 'nomor_tagihan', g.nomor), g.nomor);
  PERFORM catat_audit(p_admin, 'tolak_klaim', 'klaim_pembayaran', k.id, NULL, to_jsonb(k) - 'isi_berkas');
  RETURN k;
END $$;

-- terima_setoran_api / konfirmasi_setoran: identical to 0004 / 0002 plus one step: when a bill is paid, its pending claim becomes "dikonfirmasi".
CREATE OR REPLACE FUNCTION terima_setoran_api(p_no_va text, p_ref text, p_tanggal_bayar date, p_nominal bigint, p_nomor_tagihan text)
RETURNS TABLE (baru boolean, transaksi_id bigint, nomor text) LANGUAGE plpgsql AS $$
DECLARE pid bigint; r pendaftaran; g tagihan; saldo_lama bigint; saldo_baru bigint; jns text; t transaksi; lama transaksi;
BEGIN
  IF p_ref IS NULL OR length(btrim(p_ref)) = 0 THEN RAISE EXCEPTION 'REFERENSI_WAJIB: referensi wajib diisi' USING ERRCODE = 'P0001'; END IF;
  IF p_nominal IS NULL OR p_nominal <= 0 THEN RAISE EXCEPTION 'NOMINAL_TIDAK_VALID: nominal harus > 0' USING ERRCODE = 'P0001'; END IF;
  IF p_tanggal_bayar IS NULL OR p_tanggal_bayar > today_jkt() THEN
    RAISE EXCEPTION 'TANGGAL_TIDAK_VALID: tanggal bayar tidak boleh di masa depan' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO pid FROM pendaftaran WHERE no_va = regexp_replace(COALESCE(p_no_va,''), '\s', '', 'g');
  IF pid IS NULL THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: nomor VA tidak dikenal' USING ERRCODE = 'P0001'; END IF;
  r := kunci_pendaftaran(pid, ARRAY['aktif']);
  SELECT * INTO lama FROM transaksi WHERE ref_eksternal = p_ref;
  IF FOUND THEN
    IF lama.pendaftaran_id <> pid OR lama.nominal_transaksi <> p_nominal THEN
      RAISE EXCEPTION 'REFERENSI_BENTROK: referensi sudah dipakai untuk setoran lain' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT false, lama.id, lama.nomor; RETURN;
  END IF;
  IF p_nomor_tagihan IS NOT NULL THEN
    SELECT * INTO g FROM tagihan WHERE tagihan.nomor = p_nomor_tagihan AND pendaftaran_id = pid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: tagihan %', p_nomor_tagihan USING ERRCODE = 'P0001'; END IF;
    IF g.status = 'lunas' OR p_nominal < g.nominal THEN g := NULL; END IF;  -- recorded as an extra deposit instead
  END IF;
  jns := CASE WHEN g.id IS NULL THEN 'Setoran tambahan' WHEN g.jenis = 'dp' THEN 'DP'
              WHEN p_nominal > g.nominal THEN 'Setoran bulanan + tambahan' ELSE 'Setoran bulanan' END;
  SELECT saldo INTO saldo_lama FROM v_saldo WHERE pendaftaran_id = pid;
  saldo_baru := saldo_lama + p_nominal;
  INSERT INTO transaksi (nomor, pendaftaran_id, tagihan_id, jenis, nominal_transaksi, tanggal_bayar, saldo_setelah, sumber, ref_eksternal)
    VALUES ('TRX-' || to_char(p_tanggal_bayar, 'YYMMDD') || '-' || lpad(nextval('transaksi_seq')::text, 4, '0'),
            pid, g.id, jns, p_nominal, p_tanggal_bayar, saldo_baru, 'api', p_ref)
    RETURNING * INTO t;
  IF g.id IS NOT NULL THEN
    UPDATE tagihan SET status = 'lunas', ref_transaksi = t.nomor WHERE tagihan.id = g.id;
    UPDATE klaim_pembayaran SET status = 'dikonfirmasi', diputuskan_pada = now() WHERE tagihan_id = g.id AND status = 'menunggu_konfirmasi';
  END IF;
  PERFORM kirim_templat(pid, 'pembayaran_terkonfirmasi', jsonb_build_object('nama', r.nama, 'nomor_transaksi', t.nomor,
    'nominal', fmt_rp(p_nominal), 'saldo', fmt_rp(saldo_baru)), t.nomor);
  IF saldo_lama < r.target_50 AND saldo_baru >= r.target_50 THEN
    BEGIN
      PERFORM kirim_templat(pid, 'target_50_tercapai', jsonb_build_object('nama', r.nama, 'saldo', fmt_rp(saldo_baru), 'target', fmt_rp(r.target_50)));
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
  PERFORM catat_audit(NULL, 'terima_setoran_api', 'transaksi', t.id, NULL, to_jsonb(t));
  RETURN QUERY SELECT true, t.id, t.nomor;
END $$;

CREATE OR REPLACE FUNCTION konfirmasi_setoran(p_id bigint, p_tanggal_bayar date, p_nominal bigint, p_tagihan_id bigint, p_admin bigint)
RETURNS transaksi LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; g tagihan; saldo_lama bigint; saldo_baru bigint; jns text; t transaksi;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['aktif']);
  IF p_nominal IS NULL OR p_nominal <= 0 THEN RAISE EXCEPTION 'NOMINAL_TIDAK_VALID: nominal harus > 0' USING ERRCODE = 'P0001'; END IF;
  IF p_tanggal_bayar IS NULL OR p_tanggal_bayar >= today_jkt() THEN
    RAISE EXCEPTION 'TANGGAL_TIDAK_VALID: tanggal setoran harus sebelum hari ini (H+1)' USING ERRCODE = 'P0001';
  END IF;
  IF p_tagihan_id IS NOT NULL THEN
    SELECT * INTO g FROM tagihan WHERE id = p_tagihan_id AND pendaftaran_id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: tagihan' USING ERRCODE = 'P0001'; END IF;
    IF g.status = 'lunas' THEN RAISE EXCEPTION 'TAGIHAN_SUDAH_LUNAS: %', g.nomor USING ERRCODE = 'P0001'; END IF;
    IF p_nominal < g.nominal THEN RAISE EXCEPTION 'NOMINAL_KURANG: minimal % untuk tagihan %', g.nominal, g.nomor USING ERRCODE = 'P0001'; END IF;
    jns := CASE WHEN g.jenis = 'dp' THEN 'DP' WHEN p_nominal > g.nominal THEN 'Setoran bulanan + tambahan' ELSE 'Setoran bulanan' END;
  ELSE
    jns := 'Setoran tambahan';
  END IF;
  SELECT saldo INTO saldo_lama FROM v_saldo WHERE pendaftaran_id = p_id;
  saldo_baru := saldo_lama + p_nominal;
  INSERT INTO transaksi (nomor, pendaftaran_id, tagihan_id, jenis, nominal_transaksi, tanggal_bayar, saldo_setelah, dikonfirmasi_oleh)
    VALUES ('TRX-' || to_char(p_tanggal_bayar, 'YYMMDD') || '-' || lpad(nextval('transaksi_seq')::text, 4, '0'),
            p_id, p_tagihan_id, jns, p_nominal, p_tanggal_bayar, saldo_baru, p_admin)
    RETURNING * INTO t;
  IF p_tagihan_id IS NOT NULL THEN
    UPDATE tagihan SET status = 'lunas', ref_transaksi = t.nomor WHERE id = p_tagihan_id;
    UPDATE klaim_pembayaran SET status = 'dikonfirmasi', diputuskan_pada = now() WHERE tagihan_id = p_tagihan_id AND status = 'menunggu_konfirmasi';
  END IF;
  PERFORM kirim_templat(p_id, 'pembayaran_terkonfirmasi', jsonb_build_object('nama', r.nama, 'nomor_transaksi', t.nomor,
    'nominal', fmt_rp(p_nominal), 'saldo', fmt_rp(saldo_baru)), t.nomor);
  IF saldo_lama < r.target_50 AND saldo_baru >= r.target_50 THEN
    -- unique index notifikasi_milestone_sekali makes this once-per-registration; a skipped insert is fine
    BEGIN
      PERFORM kirim_templat(p_id, 'target_50_tercapai', jsonb_build_object('nama', r.nama, 'saldo', fmt_rp(saldo_baru), 'target', fmt_rp(r.target_50)));
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
  PERFORM catat_audit(p_admin, 'konfirmasi_setoran', 'transaksi', t.id, NULL, to_jsonb(t));
  RETURN t;
END $$;
