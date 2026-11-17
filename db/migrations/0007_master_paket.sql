-- Cara persalinan and kelas kamar become master data (add / rename / hide / delete when unused) instead of values fixed in the schema.
-- paket keeps the names as text; the API validates them against these tables and derives the tier from the kelas kamar.
ALTER TABLE paket DROP CONSTRAINT paket_cara_persalinan_check;
ALTER TABLE paket DROP CONSTRAINT paket_tier_check;

CREATE TABLE opsi_cara_persalinan (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama text NOT NULL UNIQUE CHECK (length(btrim(nama)) > 0),
  aktif boolean NOT NULL DEFAULT true
);
CREATE TABLE opsi_kelas_kamar (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama text NOT NULL UNIQUE CHECK (length(btrim(nama)) > 0),
  tier text NOT NULL CHECK (tier IN ('Saving+ Premium','Saving+ Essential')),
  aktif boolean NOT NULL DEFAULT true
);

INSERT INTO opsi_cara_persalinan (nama) SELECT DISTINCT cara_persalinan FROM paket ORDER BY 1;
INSERT INTO opsi_kelas_kamar (nama, tier) SELECT DISTINCT kelas_kamar, tier FROM paket ORDER BY 1;
