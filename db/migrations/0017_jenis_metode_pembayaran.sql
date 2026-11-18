-- Metode pembayaran punya jenis: 'va' (lewat virtual account; setoran masuk otomatis), 'transfer_manual' dan 'tunai' (tidak lewat VA;
-- keuangan yang mengonfirmasi). Konfirmasi setoran manual mencatat metode yang dipakai (transaksi.kanal_id).
ALTER TABLE kanal_pembayaran
  ADD COLUMN jenis text NOT NULL DEFAULT 'va' CHECK (jenis IN ('va','transfer_manual','tunai'));
ALTER TABLE transaksi ADD COLUMN kanal_id bigint REFERENCES kanal_pembayaran(id);

-- Dua metode non-VA beserta langkahnya (teks awal; admin bisa mengubahnya di halaman Metode pembayaran).
-- 'tunai' sudah ada sejak data awal (nonaktif, "Belum disetujui oleh RS."); sekarang diaktifkan dan diberi jenis.
INSERT INTO kanal_pembayaran (kode, nama, deskripsi, aktif, jenis) VALUES
  ('transfer_bank_manual', 'Transfer bank manual', 'Transfer ke rekening rumah sakit, dikonfirmasi keuangan setelah mutasi dicek.', true, 'transfer_manual')
ON CONFLICT (kode) DO NOTHING;
UPDATE kanal_pembayaran SET jenis = 'tunai', aktif = true, deskripsi = 'Bayar langsung di kasir rumah sakit, dikonfirmasi keuangan.' WHERE kode = 'tunai';
INSERT INTO instruksi_pembayaran (kanal_id, judul, isi, urutan)
SELECT k.id, l.judul, l.isi, l.urutan
FROM kanal_pembayaran k JOIN (VALUES
  ('transfer_bank_manual', 1, 'Transfer', 'Transfer sesuai nominal tagihan ke rekening rumah sakit yang diberikan petugas.'),
  ('transfer_bank_manual', 2, 'Simpan bukti', 'Simpan bukti transfer sampai pembayaran terkonfirmasi.'),
  ('transfer_bank_manual', 3, 'Konfirmasi', 'Keuangan rumah sakit mengonfirmasi setelah mutasi bank dicek, paling cepat H+1. Setelah itu tagihan lunas dan saldo bertambah.'),
  ('tunai', 1, 'Bayar di kasir', 'Datang ke kasir rumah sakit dengan membawa nomor tagihan, lalu bayar sesuai nominal.'),
  ('tunai', 2, 'Simpan bukti', 'Simpan bukti pembayaran dari kasir.'),
  ('tunai', 3, 'Konfirmasi', 'Keuangan rumah sakit mengonfirmasi pembayaran, paling cepat H+1. Setelah itu tagihan lunas dan saldo bertambah.')
) AS l(kode, urutan, judul, isi) ON l.kode = k.kode
WHERE NOT EXISTS (SELECT 1 FROM instruksi_pembayaran i WHERE i.kanal_id = k.id);

-- Data lama: setoran yang dikonfirmasi admin dulunya selalu transfer manual. Hanya kolom metode baru yang diisi; nominal dan saldo tidak berubah.
ALTER TABLE transaksi DISABLE TRIGGER transaksi_append_only;
UPDATE transaksi SET kanal_id = (SELECT id FROM kanal_pembayaran WHERE kode = 'transfer_bank_manual') WHERE sumber = 'admin' AND jenis <> 'Koreksi';
ALTER TABLE transaksi ENABLE TRIGGER transaksi_append_only;

-- Konfirmasi manual menerima metode: harus ada, aktif, dan bukan jenis 'va'. NULL tetap diterima fungsi ini; panel dan API mewajibkannya.
DROP FUNCTION konfirmasi_setoran(bigint, date, bigint, bigint, bigint);
CREATE FUNCTION konfirmasi_setoran(p_id bigint, p_tanggal_bayar date, p_nominal bigint, p_tagihan_id bigint, p_admin bigint, p_kanal_id bigint DEFAULT NULL)
RETURNS transaksi LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; g tagihan; saldo_lama bigint; saldo_baru bigint; jns text; t transaksi; kn kanal_pembayaran;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['aktif']);
  IF p_nominal IS NULL OR p_nominal <= 0 THEN RAISE EXCEPTION 'NOMINAL_TIDAK_VALID: nominal harus > 0' USING ERRCODE = 'P0001'; END IF;
  IF p_tanggal_bayar IS NULL OR p_tanggal_bayar >= today_jkt() THEN
    RAISE EXCEPTION 'TANGGAL_TIDAK_VALID: tanggal setoran harus sebelum hari ini (H+1)' USING ERRCODE = 'P0001';
  END IF;
  IF p_kanal_id IS NOT NULL THEN
    SELECT * INTO kn FROM kanal_pembayaran WHERE id = p_kanal_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: metode pembayaran' USING ERRCODE = 'P0001'; END IF;
    IF NOT kn.aktif OR kn.jenis = 'va' THEN
      RAISE EXCEPTION 'METODE_TIDAK_VALID: metode % tidak bisa dipakai untuk konfirmasi manual', kn.nama USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_tagihan_id IS NOT NULL THEN
    SELECT * INTO g FROM tagihan WHERE id = p_tagihan_id AND pendaftaran_id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TIDAK_DITEMUKAN: tagihan' USING ERRCODE = 'P0001'; END IF;
    IF g.status = 'lunas' THEN RAISE EXCEPTION 'TAGIHAN_SUDAH_LUNAS: %', g.nomor USING ERRCODE = 'P0001'; END IF;
    -- A bill with a live gateway charge is on the gateway route: its callback confirms it automatically, so an admin must not confirm it as well.
    IF EXISTS (SELECT 1 FROM pembayaran_gateway WHERE tagihan_id = g.id AND status = 'menunggu') THEN
      RAISE EXCEPTION 'MENUNGGU_GATEWAY: tagihan % sedang menunggu pembayaran lewat gateway; konfirmasi manual hanya untuk transfer bank manual dan tunai', g.nomor USING ERRCODE = 'P0001';
    END IF;
    IF p_nominal < g.nominal THEN RAISE EXCEPTION 'NOMINAL_KURANG: minimal % untuk tagihan %', g.nominal, g.nomor USING ERRCODE = 'P0001'; END IF;
    jns := CASE WHEN g.jenis = 'dp' THEN 'DP' WHEN p_nominal > g.nominal THEN 'Setoran bulanan + tambahan' ELSE 'Setoran bulanan' END;
  ELSE
    jns := 'Setoran tambahan';
  END IF;
  SELECT saldo INTO saldo_lama FROM v_saldo WHERE pendaftaran_id = p_id;
  saldo_baru := saldo_lama + p_nominal;
  INSERT INTO transaksi (nomor, pendaftaran_id, tagihan_id, jenis, nominal_transaksi, tanggal_bayar, saldo_setelah, dikonfirmasi_oleh, kanal_id)
    VALUES ('TRX-' || to_char(p_tanggal_bayar, 'YYMMDD') || '-' || lpad(nextval('transaksi_seq')::text, 4, '0'),
            p_id, p_tagihan_id, jns, p_nominal, p_tanggal_bayar, saldo_baru, p_admin, p_kanal_id)
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
