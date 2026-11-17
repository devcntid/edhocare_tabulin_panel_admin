-- Scenarios for notification templates and API deposit ingestion. Run on a freshly migrated scratch DB:
--   psql -d tabulin_scratch -v ON_ERROR_STOP=1 -q -f tests/sql/integrasi.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.ok(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.gagal(label text, kode text, sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE kode || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'FAILED: % (wrong error: %)', label, SQLERRM;
  END;
  RAISE EXCEPTION 'FAILED: % (no error)', label;
END $$;

INSERT INTO pengguna_admin (email, nama, peran, password_hash) VALUES ('t@x', 'T', 'super_admin', 'x');

DO $$
DECLARE a bigint; pid bigint; p paket; va text; bill tagihan; r record; n int;
BEGIN
  SELECT id INTO a FROM pengguna_admin LIMIT 1;
  SELECT * INTO p FROM paket WHERE kelas_kamar = 'Kelas 3' AND cara_persalinan = 'Partus Normal';
  INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, hpht, tanggal_milestone, perkiraan_hpl, tarif_total, dp, target_50, setoran_min_bulanan)
  VALUES ('Sari Uji', '00-77-01', '081234567890', 1, p.id, today_jkt() - 60, today_jkt() + 136, today_jkt() + 220, tarif_paket(1, p.cara_persalinan, p.kelas_kamar), 2300000, 5750000, p.setoran_min_bulanan)
  RETURNING id INTO pid;

  -- templates render {{variables}} and keep a snapshot; log columns are filled
  PERFORM setujui_pendaftaran(pid, a);
  SELECT * INTO r FROM notifikasi WHERE pendaftaran_id = pid AND templat_kode = 'pendaftaran_disetujui';
  PERFORM pg_temp.ok('template rendered with name', r.isi LIKE 'Halo Sari Uji,%' AND r.isi NOT LIKE '%{{%');
  PERFORM pg_temp.ok('log columns', r.kanal = 'push' AND r.status_kirim = 'tercatat' AND r.galat IS NULL);

  -- editing a template changes later notifications only
  UPDATE templat_notifikasi SET isi = 'Nomor VA: {{nomor_va}} ({{bank}})' WHERE kode = 'va_tersedia';
  PERFORM pasang_va(pid, '1234500000000999', a);
  SELECT * INTO r FROM notifikasi WHERE pendaftaran_id = pid AND templat_kode = 'va_tersedia';
  PERFORM pg_temp.ok('edited template used', r.isi = 'Nomor VA: 1234500000000999 (BCA)');
  PERFORM pg_temp.ok('old notification untouched', (SELECT isi FROM notifikasi WHERE pendaftaran_id = pid AND templat_kode = 'pendaftaran_disetujui') LIKE 'Halo Sari Uji,%');

  -- inactive template sends nothing
  UPDATE templat_notifikasi SET aktif = false WHERE kode = 'tagihan_bulanan_terbit';
  SELECT count(*) INTO n FROM notifikasi WHERE pendaftaran_id = pid;
  PERFORM terbitkan_tagihan_bulanan(pid, to_char(date_trunc('month', today_jkt()) + interval '1 month', 'YYYY-MM'), 1000000, a);
  PERFORM pg_temp.ok('inactive template: no notification', (SELECT count(*) FROM notifikasi WHERE pendaftaran_id = pid) = n);

  -- API ingestion
  va := '1234500000000999';
  SELECT * INTO bill FROM tagihan WHERE pendaftaran_id = pid AND jenis = 'dp';
  PERFORM pg_temp.gagal('unknown VA', 'TIDAK_DITEMUKAN', $q$SELECT * FROM terima_setoran_api('999', 'R0', today_jkt(), 1000, NULL)$q$);
  PERFORM pg_temp.gagal('future date', 'TANGGAL_TIDAK_VALID', format('SELECT * FROM terima_setoran_api(%L, ''R0'', today_jkt()+1, 1000, NULL)', va));
  PERFORM pg_temp.gagal('empty reference', 'REFERENSI_WAJIB', format('SELECT * FROM terima_setoran_api(%L, '' '', today_jkt(), 1000, NULL)', va));
  SELECT * INTO r FROM terima_setoran_api(va, 'BCA-1', today_jkt(), bill.nominal, bill.nomor);
  PERFORM pg_temp.ok('new deposit', r.baru);
  PERFORM pg_temp.ok('DP bill paid by API deposit', (SELECT status FROM tagihan WHERE id = bill.id) = 'lunas'
    AND (SELECT jenis FROM transaksi WHERE ref_eksternal = 'BCA-1') = 'DP' AND (SELECT sumber FROM transaksi WHERE ref_eksternal = 'BCA-1') = 'api');
  SELECT * INTO r FROM terima_setoran_api(va, 'BCA-1', today_jkt(), bill.nominal, bill.nomor);
  PERFORM pg_temp.ok('replay is idempotent', NOT r.baru AND (SELECT count(*) FROM transaksi WHERE ref_eksternal = 'BCA-1') = 1);
  PERFORM pg_temp.gagal('same reference, other amount', 'REFERENSI_BENTROK', format('SELECT * FROM terima_setoran_api(%L, ''BCA-1'', today_jkt(), 5, NULL)', va));
  SELECT * INTO r FROM terima_setoran_api(va, 'BCA-2', today_jkt(), 100000, bill.nomor);
  PERFORM pg_temp.ok('small deposit on paid bill -> extra deposit', (SELECT jenis FROM transaksi WHERE ref_eksternal = 'BCA-2') = 'Setoran tambahan');
  PERFORM terima_setoran_api(va, 'BCA-3', today_jkt(), 4000000, NULL);
  PERFORM pg_temp.ok('crossing 50% sends one milestone notice', (SELECT count(*) FROM notifikasi WHERE pendaftaran_id = pid AND kategori = 'milestone') = 1);
  PERFORM terima_setoran_api(va, 'BCA-4', today_jkt(), 1000000, NULL);
  PERFORM pg_temp.ok('milestone still once', (SELECT count(*) FROM notifikasi WHERE pendaftaran_id = pid AND kategori = 'milestone') = 1);
  PERFORM pg_temp.ok('balance = sum of ledger', (SELECT saldo FROM v_saldo WHERE pendaftaran_id = pid) = 2300000 + 100000 + 4000000 + 1000000);

  -- payment log is append-only
  INSERT INTO log_setoran_api (hasil) VALUES ('diterima');
  PERFORM pg_temp.gagal('log update blocked', 'APPEND_ONLY', 'UPDATE log_setoran_api SET hasil = ''ditolak''');

  RAISE NOTICE 'ALL INTEGRATION CHECKS PASSED';
END $$;

ROLLBACK;
