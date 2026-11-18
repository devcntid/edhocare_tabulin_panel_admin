-- Konfirmasi setoran manual hanya untuk jalur transfer bank manual (tiket Tabulin: Konfirmasi setoran).
-- Tagihan dengan pembayaran gateway yang masih menunggu ditolak; callback gateway yang mengkonfirmasinya.
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
    -- Manual confirmation is for the bank-transfer route (patient pays the fixed VA, finance checks the mutation). A bill with a live
    -- gateway charge is on the gateway route: its callback confirms it automatically, so an admin must not confirm it as well.
    IF EXISTS (SELECT 1 FROM pembayaran_gateway WHERE tagihan_id = g.id AND status = 'menunggu') THEN
      RAISE EXCEPTION 'MENUNGGU_GATEWAY: tagihan % sedang menunggu pembayaran lewat gateway; konfirmasi manual hanya untuk transfer bank manual', g.nomor USING ERRCODE = 'P0001';
    END IF;
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
