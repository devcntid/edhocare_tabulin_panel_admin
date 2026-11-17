-- Pricing model: cara persalinan and kelas kamar each have their own price per faskes; a registration's total tariff = harga cara + harga kelas (for the chosen faskes).
-- The saving flow is unchanged (DP, target and installments are computed from that total; the balance is settled at the end).
-- paket stays as the registry of cara x kelas combinations (created on demand); it no longer carries a tariff.
CREATE TABLE harga_cara (
  faskes_id bigint NOT NULL REFERENCES faskes(id),
  cara_id bigint NOT NULL REFERENCES opsi_cara_persalinan(id) ON DELETE CASCADE,
  harga bigint NOT NULL CHECK (harga > 0),
  PRIMARY KEY (faskes_id, cara_id)
);
CREATE TABLE harga_kelas (
  faskes_id bigint NOT NULL REFERENCES faskes(id),
  kelas_id bigint NOT NULL REFERENCES opsi_kelas_kamar(id) ON DELETE CASCADE,
  harga bigint NOT NULL CHECK (harga > 0),
  PRIMARY KEY (faskes_id, kelas_id)
);

-- Demo starting values (to be replaced with the hospital's real prices): cara prices are fixed guesses; kelas price = old Partus Normal tariff minus the Partus Normal cara price.
INSERT INTO harga_cara (faskes_id, cara_id, harga)
SELECT f.id, c.id, CASE c.nama WHEN 'Caesar Konvensional' THEN 20000000 WHEN 'Caesar ERACS' THEN 22000000 ELSE 8000000 END
FROM faskes f CROSS JOIN opsi_cara_persalinan c;
INSERT INTO harga_kelas (faskes_id, kelas_id, harga)
SELECT f.id, k.id, (SELECT p.tarif_total FROM paket p WHERE p.kelas_kamar = k.nama AND p.cara_persalinan = 'Partus Normal') - 8000000
FROM faskes f CROSS JOIN opsi_kelas_kamar k;

ALTER TABLE paket DROP COLUMN tarif_total, DROP COLUMN aktif;

CREATE FUNCTION tarif_paket(p_faskes bigint, p_cara text, p_kelas text) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT hc.harga + hk.harga
  FROM opsi_cara_persalinan c
  JOIN harga_cara hc ON hc.cara_id = c.id AND hc.faskes_id = p_faskes
  JOIN opsi_kelas_kamar k ON k.nama = p_kelas
  JOIN harga_kelas hk ON hk.kelas_id = k.id AND hk.faskes_id = p_faskes
  WHERE c.nama = p_cara
$$;
