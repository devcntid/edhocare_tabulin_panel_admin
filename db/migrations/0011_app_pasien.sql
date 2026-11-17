-- Patient-app API (contract E-10, E-14, E-04 idempotency). Identity of the app user = pasien.no_rm.
CREATE TABLE perangkat (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no_rm text NOT NULL REFERENCES pasien(no_rm),
  id_perangkat text NOT NULL UNIQUE,
  token_fcm text NOT NULL CHECK (length(btrim(token_fcm)) > 0),
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  versi_aplikasi text,
  terdaftar_pada timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON perangkat (no_rm);

-- POST /enrollments with the same Idempotency-Key returns the first registration instead of creating another.
CREATE TABLE kunci_idempotensi (
  no_rm text NOT NULL REFERENCES pasien(no_rm),
  kunci text NOT NULL CHECK (length(kunci) BETWEEN 8 AND 100),
  pendaftaran_id bigint NOT NULL REFERENCES pendaftaran(id),
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (no_rm, kunci)
);
