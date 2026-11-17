-- Scenario test for the registration lifecycle and ledger. Run on a freshly migrated scratch DB:
--   psql -d tabulin_scratch -v ON_ERROR_STOP=1 -q -f tests/sql/ledger_core.sql
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
DECLARE a bigint; pid bigint; p paket; dp_id bigint; t transaksi; g tagihan; k transaksi; pn int;
BEGIN
  SELECT id INTO a FROM pengguna_admin LIMIT 1;
  SELECT * INTO p FROM paket WHERE kelas_kamar = 'Kelas 3' AND cara_persalinan = 'Partus Normal';
  INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, hpht, tanggal_milestone, perkiraan_hpl,
                           tarif_total, dp, target_50, setoran_min_bulanan)
  VALUES ('Sari', '00-99-01', '081234567890', 1, p.id, today_jkt() - 60, today_jkt() + 136, today_jkt() + 220,
          tarif_paket(1, p.cara_persalinan, p.kelas_kamar), round(tarif_paket(1, p.cara_persalinan, p.kelas_kamar) * 0.2), round(tarif_paket(1, p.cara_persalinan, p.kelas_kamar) * 0.5), p.setoran_min_bulanan)
  RETURNING id INTO pid;

  -- lifecycle guards
  PERFORM pg_temp.gagal('pasang_va before approval', 'STATUS_TIDAK_VALID', format('SELECT pasang_va(%s, NULL, %s)', pid, a));
  PERFORM pg_temp.gagal('tolak without reason', 'ALASAN_WAJIB', format('SELECT tolak_pendaftaran(%s, '' '', %s)', pid, a));
  PERFORM setujui_pendaftaran(pid, a);
  PERFORM pg_temp.gagal('double approve', 'STATUS_TIDAK_VALID', format('SELECT setujui_pendaftaran(%s, %s)', pid, a));
  PERFORM pg_temp.gagal('bad VA', 'VA_TIDAK_VALID', format('SELECT pasang_va(%s, ''123'', %s)', pid, a));
  PERFORM pasang_va(pid, NULL, a);
  PERFORM pg_temp.ok('DP bill created', (SELECT nominal FROM tagihan WHERE pendaftaran_id = pid AND jenis = 'dp') = 2300000);
  PERFORM pg_temp.ok('VA set', (SELECT length(no_va) FROM pendaftaran WHERE id = pid) = 16);
  PERFORM pg_temp.gagal('direct bad status jump', 'STATUS_TIDAK_VALID', format('UPDATE pendaftaran SET status_pendaftaran = ''menunggu_verifikasi'' WHERE id = %s', pid));

  SELECT id INTO dp_id FROM tagihan WHERE pendaftaran_id = pid AND jenis = 'dp';

  -- deposit rules
  PERFORM pg_temp.gagal('same-day deposit (H+1)', 'TANGGAL_TIDAK_VALID', format('SELECT konfirmasi_setoran(%s, today_jkt(), 2300000, %s, %s)', pid, dp_id, a));
  PERFORM pg_temp.gagal('under-payment', 'NOMINAL_KURANG', format('SELECT konfirmasi_setoran(%s, today_jkt() - 1, 2000000, %s, %s)', pid, dp_id, a));
  PERFORM pg_temp.gagal('zero amount', 'NOMINAL_TIDAK_VALID', format('SELECT konfirmasi_setoran(%s, today_jkt() - 1, 0, NULL, %s)', pid, a));
  t := konfirmasi_setoran(pid, today_jkt() - 1, 2300000, dp_id, a);
  PERFORM pg_temp.ok('DP jenis', t.jenis = 'DP' AND t.saldo_setelah = 2300000);
  PERFORM pg_temp.ok('DP bill lunas', (SELECT status FROM tagihan WHERE id = dp_id) = 'lunas');
  PERFORM pg_temp.gagal('pay lunas bill again', 'TAGIHAN_SUDAH_LUNAS', format('SELECT konfirmasi_setoran(%s, today_jkt() - 1, 2300000, %s, %s)', pid, dp_id, a));

  -- monthly bill
  PERFORM pg_temp.gagal('below minimum', 'NOMINAL_TIDAK_VALID', format('SELECT terbitkan_tagihan_bulanan(%s, to_char(today_jkt() + 31, ''YYYY-MM''), 500000, %s)', pid, a));
  PERFORM pg_temp.gagal('same period as DP', 'PERIODE_TIDAK_VALID', format('SELECT terbitkan_tagihan_bulanan(%s, to_char(today_jkt(), ''YYYY-MM''), 1000000, %s)', pid, a));
  g := terbitkan_tagihan_bulanan(pid, to_char(date_trunc('month', today_jkt()) + interval '1 month', 'YYYY-MM'), 1000000, a);
  PERFORM pg_temp.gagal('duplicate period', 'TAGIHAN_SUDAH_ADA', format('SELECT terbitkan_tagihan_bulanan(%s, %L, 1000000, %s)', pid, g.periode, a));
  t := konfirmasi_setoran(pid, today_jkt() - 1, 1500000, g.id, a);
  PERFORM pg_temp.ok('bulanan + tambahan', t.jenis = 'Setoran bulanan + tambahan' AND t.saldo_setelah = 3800000);
  t := konfirmasi_setoran(pid, today_jkt() - 2, 1000000, NULL, a);
  PERFORM pg_temp.ok('tambahan', t.jenis = 'Setoran tambahan' AND t.saldo_setelah = 4800000);
  PERFORM pg_temp.ok('no milestone yet', (SELECT count(*) FROM notifikasi WHERE pendaftaran_id = pid AND kategori = 'milestone') = 0);

  -- crossing target_50 (5,750,000) fires exactly one milestone notice, even after a correction + re-cross
  t := konfirmasi_setoran(pid, today_jkt() - 1, 1000000, NULL, a);
  PERFORM pg_temp.ok('milestone once', (SELECT count(*) FROM notifikasi WHERE pendaftaran_id = pid AND kategori = 'milestone') = 1);
  k := koreksi_setoran(t.id, 'salah input', a);
  PERFORM pg_temp.ok('correction negative row', k.nominal_transaksi = -1000000 AND k.saldo_setelah = 4800000 AND k.jenis = 'Koreksi');
  PERFORM pg_temp.gagal('correct twice', 'KOREKSI_TIDAK_VALID', format('SELECT koreksi_setoran(%s, ''lagi'', %s)', t.id, a));
  PERFORM pg_temp.gagal('correct a correction', 'KOREKSI_TIDAK_VALID', format('SELECT koreksi_setoran(%s, ''lagi'', %s)', k.id, a));
  PERFORM konfirmasi_setoran(pid, today_jkt() - 1, 1000000, NULL, a);
  PERFORM pg_temp.ok('milestone still once', (SELECT count(*) FROM notifikasi WHERE pendaftaran_id = pid AND kategori = 'milestone') = 1);

  -- correcting a bill payment reopens the bill
  SELECT * INTO t FROM transaksi WHERE tagihan_id = g.id AND koreksi_dari IS NULL;
  PERFORM koreksi_setoran(t.id, 'dibatalkan bank', a);
  PERFORM pg_temp.ok('bill reopened', (SELECT status FROM tagihan WHERE id = g.id) = 'belum_dibayar');

  -- ledger integrity
  PERFORM pg_temp.ok('saldo view = ledger sum', (SELECT saldo FROM v_saldo WHERE pendaftaran_id = pid) =
    (SELECT sum(nominal_transaksi) FROM transaksi WHERE pendaftaran_id = pid));
  PERFORM pg_temp.ok('saldo_setelah chain', (SELECT saldo_setelah FROM transaksi WHERE pendaftaran_id = pid ORDER BY id DESC LIMIT 1) =
    (SELECT saldo FROM v_saldo WHERE pendaftaran_id = pid));
  PERFORM pg_temp.gagal('ledger update blocked', 'APPEND_ONLY', 'UPDATE transaksi SET keterangan = ''x''');
  PERFORM pg_temp.gagal('ledger delete blocked', 'APPEND_ONLY', 'DELETE FROM transaksi');
  PERFORM pg_temp.gagal('audit update blocked', 'APPEND_ONLY', 'UPDATE audit_log SET aksi = ''x''');

  -- finish
  PERFORM tandai_selesai(pid, a);
  PERFORM pg_temp.ok('total_setoran = saldo', (SELECT total_setoran FROM pendaftaran WHERE id = pid) = (SELECT saldo FROM v_saldo WHERE pendaftaran_id = pid));
  PERFORM pg_temp.gagal('deposit after selesai', 'STATUS_TIDAK_VALID', format('SELECT konfirmasi_setoran(%s, today_jkt() - 1, 1000000, NULL, %s)', pid, a));

  -- rejection path + one live registration per No. RM
  PERFORM pg_temp.gagal('duplicate live registration', 'duplicate key', format('INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, hpht, tanggal_milestone, perkiraan_hpl, tarif_total, dp, target_50, setoran_min_bulanan) VALUES (''X'', ''00-99-01'', ''081234567890'', 1, %s, today_jkt(), today_jkt(), today_jkt(), 1, 1, 1, 1)', p.id));
  SELECT count(*) INTO pn FROM audit_log;
  PERFORM pg_temp.ok('audit rows written', pn >= 10);

  RAISE NOTICE 'ALL LEDGER CHECKS PASSED';
END $$;

ROLLBACK;
