-- Patient master data. In production it is filled from the hospital/customer-app API (to be provided); the admin panel only reads it.
-- A registration copies name and phone from here at creation time; pendaftaran keeps its own copy (no FK) so history is unaffected by later patient edits.
CREATE TABLE pasien (
  no_rm text PRIMARY KEY CHECK (length(btrim(no_rm)) > 0),
  nama text NOT NULL CHECK (length(btrim(nama)) > 0),
  no_hp text NOT NULL CHECK (no_hp ~ '^[0-9]{10,13}$'),
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pasien (no_rm, nama, no_hp)
SELECT DISTINCT ON (no_rm) no_rm, nama, no_hp FROM pendaftaran ORDER BY no_rm, id DESC;
