-- Deposits are reported by the customer app / bank API (status A): the admin no longer types them in.
-- The ledger records what the API says happened, idempotently by external reference.
ALTER TABLE transaksi
  ADD COLUMN sumber text NOT NULL DEFAULT 'admin' CHECK (sumber IN ('admin','api')),
  ADD COLUMN ref_eksternal text UNIQUE;

-- Returns the ledger row and whether it was newly created. A real deposit is never refused for being
-- "too small" or same-day (those are admin-entry rules); a bill is only marked paid if the amount covers it.
CREATE FUNCTION terima_setoran_api(p_no_va text, p_ref text, p_tanggal_bayar date, p_nominal bigint, p_nomor_tagihan text)
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
  IF g.id IS NOT NULL THEN UPDATE tagihan SET status = 'lunas', ref_transaksi = t.nomor WHERE tagihan.id = g.id; END IF;
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
