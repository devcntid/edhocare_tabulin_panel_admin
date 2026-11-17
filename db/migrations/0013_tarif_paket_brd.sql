-- Tariff per package (cara persalinan x kelas kamar) as in BRD §3 / the Tabulin mockup. That table is not additive
-- (e.g. Suite vs VIP A differs by 5M for Konvensional but 3M for Partus Normal), so harga_cara + harga_kelas cannot reproduce it.
-- harga_paket holds the explicit tariff per faskes; tarif_paket() uses it when a row exists and falls back to the additive model otherwise.
CREATE TABLE harga_paket (
  faskes_id bigint NOT NULL REFERENCES faskes(id),
  cara_id bigint NOT NULL REFERENCES opsi_cara_persalinan(id) ON DELETE CASCADE,
  kelas_id bigint NOT NULL REFERENCES opsi_kelas_kamar(id) ON DELETE CASCADE,
  harga bigint NOT NULL CHECK (harga > 0),
  PRIMARY KEY (faskes_id, cara_id, kelas_id)
);

-- Mockup tariffs (same for every faskes; D-21 undecided). Order: Caesar Konvensional, Caesar ERACS, Partus Normal.
INSERT INTO harga_paket (faskes_id, cara_id, kelas_id, harga)
SELECT f.id, c.id, k.id, v.harga
FROM faskes f
CROSS JOIN (VALUES
  ('Suite','Caesar Konvensional',54000000), ('Suite','Caesar ERACS',58000000), ('Suite','Partus Normal',27000000),
  ('Junior Suite','Caesar Konvensional',54000000), ('Junior Suite','Caesar ERACS',58000000), ('Junior Suite','Partus Normal',27000000),
  ('VIP A','Caesar Konvensional',49000000), ('VIP A','Caesar ERACS',52000000), ('VIP A','Partus Normal',24000000),
  ('VIP B','Caesar Konvensional',45000000), ('VIP B','Caesar ERACS',47000000), ('VIP B','Partus Normal',20500000),
  ('VIP C','Caesar Konvensional',40500000), ('VIP C','Caesar ERACS',42500000), ('VIP C','Partus Normal',18000000),
  ('Kelas 1','Caesar Konvensional',35000000), ('Kelas 1','Caesar ERACS',37500000), ('Kelas 1','Partus Normal',15000000),
  ('Kelas 2','Caesar Konvensional',31000000), ('Kelas 2','Caesar ERACS',34500000), ('Kelas 2','Partus Normal',13000000),
  ('Kelas 3','Caesar Konvensional',27000000), ('Kelas 3','Caesar ERACS',29000000), ('Kelas 3','Partus Normal',11500000)
) AS v(kelas, cara, harga)
JOIN opsi_cara_persalinan c ON c.nama = v.cara
JOIN opsi_kelas_kamar k ON k.nama = v.kelas;

CREATE OR REPLACE FUNCTION tarif_paket(p_faskes bigint, p_cara text, p_kelas text) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT hp.harga FROM harga_paket hp
       JOIN opsi_cara_persalinan c ON c.id = hp.cara_id AND c.nama = p_cara
       JOIN opsi_kelas_kamar k ON k.id = hp.kelas_id AND k.nama = p_kelas
      WHERE hp.faskes_id = p_faskes),
    (SELECT hc.harga + hk.harga
       FROM opsi_cara_persalinan c
       JOIN harga_cara hc ON hc.cara_id = c.id AND hc.faskes_id = p_faskes
       JOIN opsi_kelas_kamar k ON k.nama = p_kelas
       JOIN harga_kelas hk ON hk.kelas_id = k.id AND hk.faskes_id = p_faskes
      WHERE c.nama = p_cara)
  )
$$;
