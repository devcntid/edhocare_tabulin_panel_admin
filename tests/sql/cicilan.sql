-- Scenarios for the installment schedule (detail_bill) and bill summary. Run on a freshly migrated scratch DB:
--   psql -d tabulin_scratch -v ON_ERROR_STOP=1 -q -f tests/sql/cicilan.sql
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
DECLARE a bigint; pid bigint; legacy bigint; g tagihan; n int; b v_bill; js bigint;
BEGIN
  SELECT id INTO a FROM pengguna_admin LIMIT 1;
  -- total 10.000.000, DP 2.000.000 -> 8.000.000 in 3 installments: 2.666.000 + 2.666.000 + 2.668.000
  INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, jumlah_cicilan, hpht, tanggal_milestone, perkiraan_hpl, tarif_total, dp, target_50, setoran_min_bulanan)
  VALUES ('Cicil Uji', '00-66-01', '081234567890', 1, (SELECT id FROM paket LIMIT 1), 3, today_jkt() - 30, today_jkt() + 166, today_jkt() + 250, 10000000, 2000000, 5000000, 2666000)
  RETURNING id INTO pid;

  PERFORM pg_temp.ok('no schedule before the DP bill', NOT EXISTS (SELECT 1 FROM jadwal_cicilan WHERE pendaftaran_id = pid));
  PERFORM setujui_pendaftaran(pid, a);
  PERFORM pasang_va(pid, NULL, a);

  SELECT count(*), sum(nominal) INTO n, js FROM jadwal_cicilan WHERE pendaftaran_id = pid;
  PERFORM pg_temp.ok('3 installments created', n = 3);
  PERFORM pg_temp.ok('installments + DP equal the total', js + 2000000 = 10000000);
  PERFORM pg_temp.ok('last installment absorbs the remainder', (SELECT nominal FROM jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 3) = 2668000);
  PERFORM pg_temp.ok('first installment is the month after the DP month',
    (SELECT periode FROM jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 1) = to_char(today_jkt() + interval '1 month', 'YYYY-MM'));
  PERFORM pg_temp.ok('all installments start unissued', NOT EXISTS (SELECT 1 FROM v_jadwal_cicilan WHERE pendaftaran_id = pid AND status_tampil <> 'belum_terbit'));

  -- issuing follows the schedule in order, one at a time
  g := terbitkan_cicilan(pid, a);
  PERFORM pg_temp.ok('first issue uses installment 1', g.nominal = 2666000 AND g.periode = (SELECT periode FROM jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 1));
  PERFORM pg_temp.ok('schedule row links to the bill', (SELECT tagihan_id FROM jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 1) = g.id);
  PERFORM pg_temp.ok('issued installment shows as unpaid', (SELECT status_tampil FROM v_jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 1) = 'belum_dibayar');
  g := terbitkan_cicilan(pid, a);
  PERFORM pg_temp.ok('second issue uses installment 2', g.periode = (SELECT periode FROM jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 2));
  g := terbitkan_cicilan(pid, a);
  PERFORM pg_temp.ok('last bill carries the remainder', g.nominal = 2668000);
  PERFORM pg_temp.gagal('no installment left', 'JADWAL_HABIS', format('SELECT terbitkan_cicilan(%s, %s)', pid, a));

  -- bill summary: paid so far, remaining, installments paid
  SELECT * INTO b FROM v_bill WHERE pendaftaran_id = pid;
  PERFORM pg_temp.ok('bill before any payment', b.total = 10000000 AND b.terbayar = 0 AND b.sisa = 10000000 AND b.cicilan_lunas = 0 AND b.jumlah_cicilan = 3);
  PERFORM konfirmasi_setoran(pid, today_jkt() - 1, 2000000, (SELECT id FROM tagihan WHERE pendaftaran_id = pid AND jenis = 'dp'), a);
  PERFORM konfirmasi_setoran(pid, today_jkt() - 1, 2666000, (SELECT tagihan_id FROM jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 1), a);
  SELECT * INTO b FROM v_bill WHERE pendaftaran_id = pid;
  PERFORM pg_temp.ok('bill after DP + 1 installment', b.terbayar = 4666000 AND b.sisa = 5334000 AND b.cicilan_lunas = 1);
  PERFORM pg_temp.ok('installment 1 is paid', (SELECT status_tampil FROM v_jadwal_cicilan WHERE pendaftaran_id = pid AND urutan = 1) = 'lunas');

  -- registrations without an installment count keep the legacy behaviour (no schedule)
  INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, hpht, tanggal_milestone, perkiraan_hpl, tarif_total, dp, target_50, setoran_min_bulanan)
  VALUES ('Lama Uji', '00-66-02', '081234567891', 1, (SELECT id FROM paket LIMIT 1), today_jkt() - 30, today_jkt() + 166, today_jkt() + 250, 10000000, 2000000, 5000000, 1000000)
  RETURNING id INTO legacy;
  PERFORM setujui_pendaftaran(legacy, a);
  PERFORM pasang_va(legacy, NULL, a);
  PERFORM pg_temp.ok('legacy registration has no schedule', NOT EXISTS (SELECT 1 FROM jadwal_cicilan WHERE pendaftaran_id = legacy));

  RAISE NOTICE 'ALL INSTALLMENT CHECKS PASSED';
END $$;

ROLLBACK;
