-- State-transition functions. Each locks the pendaftaran row first (lock order: pendaftaran -> tagihan),
-- checks the status, and writes the audit log + notifications in the same transaction.
-- Errors: SQLSTATE P0001, message "KODE: detail".

CREATE FUNCTION nama_bulan(p text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT (ARRAY['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])[substr(p,6,2)::int] || ' ' || substr(p,1,4) $$;

CREATE FUNCTION kunci_pendaftaran(p_id bigint, p_status text[]) RETURNS pendaftaran LANGUAGE plpgsql AS $$
DECLARE r pendaftaran;
BEGIN
  SELECT * INTO r FROM pendaftaran WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: pendaftaran %', p_id USING ERRCODE = 'P0001'; END IF;
  IF NOT (r.status_pendaftaran = ANY (p_status)) THEN
    RAISE EXCEPTION 'STATUS_TIDAK_VALID: status saat ini %', r.status_pendaftaran USING ERRCODE = 'P0001';
  END IF;
  RETURN r;
END $$;

CREATE FUNCTION catat_audit(p_admin bigint, p_aksi text, p_entitas text, p_id bigint, p_sebelum jsonb, p_sesudah jsonb)
RETURNS void LANGUAGE sql AS
$$ INSERT INTO audit_log (pengguna_id, aksi, entitas, entitas_id, sebelum, sesudah) VALUES (p_admin, p_aksi, p_entitas, p_id, p_sebelum, p_sesudah) $$;


CREATE FUNCTION fmt_rp(n bigint) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT 'Rp ' || replace(to_char(n, 'FM999G999G999G999'), ',', '.') $$;

CREATE FUNCTION fmt_tgl(d date) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT extract(day FROM d)::int || ' ' || (ARRAY['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])[extract(month FROM d)::int] || ' ' || extract(year FROM d)::int $$;

-- Render template `p_kode` with {{variable}} values and record the notification (mock delivery = logged locally).
-- An inactive or missing template sends nothing.
CREATE FUNCTION kirim_templat(p_pend bigint, p_kode text, p_vars jsonb, p_ref text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t templat_notifikasi; j text; i text; kv record;
BEGIN
  SELECT * INTO t FROM templat_notifikasi WHERE kode = p_kode AND aktif;
  IF NOT FOUND THEN RETURN; END IF;
  j := t.judul; i := t.isi;
  FOR kv IN SELECT key, value FROM jsonb_each_text(COALESCE(p_vars, '{}'::jsonb)) LOOP
    j := replace(j, '{{' || kv.key || '}}', kv.value);
    i := replace(i, '{{' || kv.key || '}}', kv.value);
  END LOOP;
  INSERT INTO notifikasi (pendaftaran_id, kategori, judul, isi, tujuan, tujuan_ref, templat_kode)
    VALUES (p_pend, t.kategori, j, i, t.tujuan, p_ref, t.kode);
END $$;

CREATE FUNCTION setujui_pendaftaran(p_id bigint, p_admin bigint) RETURNS pendaftaran LANGUAGE plpgsql AS $$
DECLARE r pendaftaran;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['menunggu_verifikasi']);
  UPDATE pendaftaran SET status_pendaftaran = 'va_disiapkan', diputuskan_pada = now() WHERE id = p_id RETURNING * INTO r;
  PERFORM kirim_templat(p_id, 'pendaftaran_disetujui', jsonb_build_object('nama', r.nama));
  PERFORM catat_audit(p_admin, 'setujui', 'pendaftaran', p_id, NULL, jsonb_build_object('status', r.status_pendaftaran));
  RETURN r;
END $$;

CREATE FUNCTION tolak_pendaftaran(p_id bigint, p_alasan text, p_admin bigint) RETURNS pendaftaran LANGUAGE plpgsql AS $$
DECLARE r pendaftaran;
BEGIN
  IF p_alasan IS NULL OR length(btrim(p_alasan)) = 0 THEN
    RAISE EXCEPTION 'ALASAN_WAJIB: alasan penolakan wajib diisi' USING ERRCODE = 'P0001';
  END IF;
  r := kunci_pendaftaran(p_id, ARRAY['menunggu_verifikasi']);
  UPDATE pendaftaran SET status_pendaftaran = 'ditolak', alasan_penolakan = btrim(p_alasan), diputuskan_pada = now()
    WHERE id = p_id RETURNING * INTO r;
  PERFORM kirim_templat(p_id, 'pendaftaran_ditolak', jsonb_build_object('nama', r.nama));
  PERFORM catat_audit(p_admin, 'tolak', 'pendaftaran', p_id, NULL, jsonb_build_object('alasan', r.alasan_penolakan));
  RETURN r;
END $$;

CREATE FUNCTION kedaluwarsakan_pendaftaran(p_id bigint, p_admin bigint) RETURNS pendaftaran LANGUAGE plpgsql AS $$
DECLARE r pendaftaran;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['menunggu_verifikasi']);
  UPDATE pendaftaran SET status_pendaftaran = 'kedaluwarsa', diputuskan_pada = now() WHERE id = p_id RETURNING * INTO r;
  PERFORM catat_audit(p_admin, 'kedaluwarsa', 'pendaftaran', p_id, NULL, jsonb_build_object('status', r.status_pendaftaran));
  RETURN r;
END $$;

CREATE FUNCTION pasang_va(p_id bigint, p_no_va text, p_admin bigint) RETURNS pendaftaran LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; va text; kfg jsonb; tempo int;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['va_disiapkan']);
  va := regexp_replace(COALESCE(p_no_va, ''), '\s', '', 'g');
  IF va = '' THEN va := '12345000' || lpad(nextval('va_seq')::text, 8, '0');
  ELSIF va !~ '^[0-9]{16}$' THEN RAISE EXCEPTION 'VA_TIDAK_VALID: nomor VA harus 16 digit' USING ERRCODE = 'P0001';
  END IF;
  SELECT (nilai #>> '{}')::int INTO tempo FROM konfigurasi WHERE kunci = 'hari_tempo_dp';
  tempo := COALESCE(tempo, 7);
  BEGIN
    UPDATE pendaftaran SET status_pendaftaran = 'aktif', no_va = va, nama_va = r.nama WHERE id = p_id RETURNING * INTO r;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'VA_DUPLIKAT: nomor VA sudah dipakai' USING ERRCODE = 'P0001';
  END;
  INSERT INTO tagihan (pendaftaran_id, nomor, jenis, periode, nominal, terbit_pada, jatuh_tempo)
    VALUES (p_id, 'INV-' || right(r.nomor, 4) || '-01', 'dp', to_char(today_jkt(), 'YYYY-MM'), r.dp, today_jkt(), today_jkt() + tempo);
  PERFORM kirim_templat(p_id, 'va_tersedia', jsonb_build_object('nama', r.nama, 'bank', r.bank_va, 'nomor_va', va));
  PERFORM kirim_templat(p_id, 'tagihan_dp_terbit', jsonb_build_object('nama', r.nama, 'nomor_tagihan', 'INV-' || right(r.nomor, 4) || '-01',
    'nominal_tagihan', fmt_rp(r.dp), 'jatuh_tempo', fmt_tgl(today_jkt() + tempo)), 'INV-' || right(r.nomor, 4) || '-01');
  PERFORM catat_audit(p_admin, 'pasang_va', 'pendaftaran', p_id, NULL, jsonb_build_object('no_va', va));
  RETURN r;
END $$;

CREATE FUNCTION terbitkan_tagihan_bulanan(p_id bigint, p_periode text, p_nominal bigint, p_admin bigint) RETURNS tagihan LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; dp_periode text; due date; n int; g tagihan; hari int;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['aktif']);
  IF p_periode !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PERIODE_TIDAK_VALID: %', p_periode USING ERRCODE = 'P0001'; END IF;
  SELECT periode INTO dp_periode FROM tagihan WHERE pendaftaran_id = p_id AND jenis = 'dp';
  IF p_periode <= dp_periode THEN
    RAISE EXCEPTION 'PERIODE_TIDAK_VALID: tagihan bulanan dimulai bulan setelah DP' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM tagihan WHERE pendaftaran_id = p_id AND periode = p_periode) THEN
    RAISE EXCEPTION 'TAGIHAN_SUDAH_ADA: periode %', p_periode USING ERRCODE = 'P0001';
  END IF;
  IF p_nominal IS NULL OR p_nominal < r.setoran_min_bulanan THEN
    RAISE EXCEPTION 'NOMINAL_TIDAK_VALID: minimal %', r.setoran_min_bulanan USING ERRCODE = 'P0001';
  END IF;
  SELECT (nilai #>> '{}')::int INTO hari FROM konfigurasi WHERE kunci = 'hari_jatuh_tempo';
  due := (p_periode || '-' || lpad(COALESCE(hari, 10)::text, 2, '0'))::date;
  IF due < today_jkt() THEN RAISE EXCEPTION 'PERIODE_TIDAK_VALID: jatuh tempo sudah lewat' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) + 1 INTO n FROM tagihan WHERE pendaftaran_id = p_id;
  INSERT INTO tagihan (pendaftaran_id, nomor, jenis, periode, nominal, terbit_pada, jatuh_tempo)
    VALUES (p_id, 'INV-' || right(r.nomor, 4) || '-' || lpad(n::text, 2, '0'), 'bulanan', p_periode, p_nominal, today_jkt(), due)
    RETURNING * INTO g;
  -- default template text carries no amount (D-04); admins may add {{nominal_tagihan}} to the template
  PERFORM kirim_templat(p_id, 'tagihan_bulanan_terbit', jsonb_build_object('nama', r.nama, 'periode', nama_bulan(p_periode),
    'nomor_tagihan', g.nomor, 'nominal_tagihan', fmt_rp(p_nominal), 'jatuh_tempo', fmt_tgl(due)), g.nomor);
  PERFORM catat_audit(p_admin, 'terbitkan_tagihan', 'tagihan', g.id, NULL, to_jsonb(g));
  RETURN g;
END $$;

CREATE FUNCTION konfirmasi_setoran(p_id bigint, p_tanggal_bayar date, p_nominal bigint, p_tagihan_id bigint, p_admin bigint)
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

-- Correction = a new negative ledger row; the original is never edited. A corrected bill payment reopens the bill.
CREATE FUNCTION koreksi_setoran(p_transaksi_id bigint, p_alasan text, p_admin bigint) RETURNS transaksi LANGUAGE plpgsql AS $$
DECLARE o transaksi; r pendaftaran; saldo_lama bigint; t transaksi;
BEGIN
  IF p_alasan IS NULL OR length(btrim(p_alasan)) = 0 THEN
    RAISE EXCEPTION 'ALASAN_WAJIB: alasan koreksi wajib diisi' USING ERRCODE = 'P0001';
  END IF;
  SELECT pendaftaran_id INTO STRICT o.pendaftaran_id FROM transaksi WHERE id = p_transaksi_id;
  r := kunci_pendaftaran(o.pendaftaran_id, ARRAY['aktif']);
  SELECT * INTO o FROM transaksi WHERE id = p_transaksi_id;
  IF o.nominal_transaksi < 0 THEN RAISE EXCEPTION 'KOREKSI_TIDAK_VALID: baris koreksi tidak dapat dikoreksi' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM transaksi WHERE koreksi_dari = o.id) THEN
    RAISE EXCEPTION 'KOREKSI_TIDAK_VALID: transaksi sudah dikoreksi' USING ERRCODE = 'P0001';
  END IF;
  SELECT saldo INTO saldo_lama FROM v_saldo WHERE pendaftaran_id = o.pendaftaran_id;
  IF saldo_lama - o.nominal_transaksi < 0 THEN
    RAISE EXCEPTION 'KOREKSI_TIDAK_VALID: saldo tidak boleh negatif' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO transaksi (nomor, pendaftaran_id, tagihan_id, koreksi_dari, jenis, nominal_transaksi, tanggal_bayar, saldo_setelah, keterangan, dikonfirmasi_oleh)
    VALUES ('TRX-' || to_char(today_jkt(), 'YYMMDD') || '-' || lpad(nextval('transaksi_seq')::text, 4, '0'),
            o.pendaftaran_id, o.tagihan_id, o.id, 'Koreksi', -o.nominal_transaksi, today_jkt(),
            saldo_lama - o.nominal_transaksi, btrim(p_alasan), p_admin)
    RETURNING * INTO t;
  IF o.tagihan_id IS NOT NULL THEN
    UPDATE tagihan SET status = 'belum_dibayar', ref_transaksi = NULL WHERE id = o.tagihan_id;
  END IF;
  PERFORM catat_audit(p_admin, 'koreksi_setoran', 'transaksi', t.id, to_jsonb(o), to_jsonb(t));
  RETURN t;
END $$;

CREATE FUNCTION tandai_selesai(p_id bigint, p_admin bigint) RETURNS pendaftaran LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; s bigint;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['aktif']);
  SELECT saldo INTO s FROM v_saldo WHERE pendaftaran_id = p_id;
  UPDATE pendaftaran SET status_pendaftaran = 'selesai', selesai_pada = now(), total_setoran = s WHERE id = p_id RETURNING * INTO r;
  PERFORM catat_audit(p_admin, 'selesai', 'pendaftaran', p_id, NULL, jsonb_build_object('total_setoran', s));
  RETURN r;
END $$;
