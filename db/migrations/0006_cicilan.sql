-- Installment schedule (detail_bill) and bill summary (bill) on top of the package model (paket = cara persalinan x kelas kamar).
-- A registration stores how many installments the patient chose; the schedule is created when the DP bill is issued.

ALTER TABLE pendaftaran ADD COLUMN jumlah_cicilan int CHECK (jumlah_cicilan BETWEEN 1 AND 24);

-- detail_bill: the full installment schedule, created when the DP bill is issued.
CREATE TABLE jadwal_cicilan (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pendaftaran_id bigint NOT NULL REFERENCES pendaftaran(id),
  urutan int NOT NULL CHECK (urutan > 0),
  periode text NOT NULL CHECK (periode ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  jatuh_tempo date NOT NULL,
  nominal bigint NOT NULL CHECK (nominal > 0),
  tagihan_id bigint UNIQUE REFERENCES tagihan(id),
  UNIQUE (pendaftaran_id, urutan),
  UNIQUE (pendaftaran_id, periode)
);

-- Installments start the month after the DP month. Each is (total - DP) / n rounded down to Rp1.000; the last one absorbs the remainder.
CREATE FUNCTION buat_jadwal_cicilan() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; hari int; sisa bigint; per bigint; i int; p text;
BEGIN
  SELECT * INTO r FROM pendaftaran WHERE id = NEW.pendaftaran_id;
  IF r.jumlah_cicilan IS NULL THEN RETURN NEW; END IF;
  SELECT (nilai #>> '{}')::int INTO hari FROM konfigurasi WHERE kunci = 'hari_jatuh_tempo';
  hari := COALESCE(hari, 10);
  sisa := r.tarif_total - r.dp;
  per := greatest(1, (sisa / r.jumlah_cicilan / 1000) * 1000);
  FOR i IN 1..r.jumlah_cicilan LOOP
    p := to_char((to_date(NEW.periode || '-01', 'YYYY-MM-DD') + make_interval(months => i))::date, 'YYYY-MM');
    INSERT INTO jadwal_cicilan (pendaftaran_id, urutan, periode, jatuh_tempo, nominal)
    VALUES (r.id, i, p, (p || '-' || lpad(hari::text, 2, '0'))::date,
            CASE WHEN i = r.jumlah_cicilan THEN sisa - per * (r.jumlah_cicilan - 1) ELSE per END);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER tagihan_dp_jadwal AFTER INSERT ON tagihan
  FOR EACH ROW WHEN (NEW.jenis = 'dp') EXECUTE FUNCTION buat_jadwal_cicilan();

-- Issue the next installment of the schedule as a bill (reuses terbitkan_tagihan_bulanan for validation, notification and audit).
CREATE FUNCTION terbitkan_cicilan(p_id bigint, p_admin bigint) RETURNS tagihan LANGUAGE plpgsql AS $$
DECLARE r pendaftaran; j jadwal_cicilan; g tagihan;
BEGIN
  r := kunci_pendaftaran(p_id, ARRAY['aktif']);
  SELECT * INTO j FROM jadwal_cicilan WHERE pendaftaran_id = p_id AND tagihan_id IS NULL ORDER BY urutan LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'JADWAL_HABIS: semua cicilan sudah diterbitkan' USING ERRCODE = 'P0001'; END IF;
  g := terbitkan_tagihan_bulanan(p_id, j.periode, j.nominal, p_admin);
  UPDATE jadwal_cicilan SET tagihan_id = g.id WHERE id = j.id;
  RETURN g;
END $$;

CREATE VIEW v_jadwal_cicilan AS
  SELECT j.*, g.nomor AS nomor_tagihan,
    CASE WHEN g.id IS NULL THEN 'belum_terbit'
         WHEN g.status = 'lunas' THEN 'lunas'
         WHEN g.jatuh_tempo < today_jkt() THEN 'lewat_jatuh_tempo'
         ELSE 'belum_dibayar' END AS status_tampil
  FROM jadwal_cicilan j LEFT JOIN tagihan g ON g.id = j.tagihan_id;

-- bill: total, paid so far (all confirmed deposits, DP included), remaining, and installments paid out of the total.
CREATE VIEW v_bill AS
  SELECT p.id AS pendaftaran_id, p.tarif_total AS total, s.saldo AS terbayar,
    greatest(0, p.tarif_total - s.saldo)::bigint AS sisa,
    p.jumlah_cicilan,
    (SELECT count(*) FROM v_jadwal_cicilan j WHERE j.pendaftaran_id = p.id AND j.status_tampil = 'lunas')::int AS cicilan_lunas
  FROM pendaftaran p JOIN v_saldo s ON s.pendaftaran_id = p.id;
