-- Contract V-05/V-06: tier and minimum monthly deposit belong to the kelas kamar; a paket (cara persalinan x kelas kamar) only carries the tariff.
-- paket.setoran_min_bulanan stays as a synced copy so existing queries and registrations are unaffected.
ALTER TABLE opsi_kelas_kamar ADD COLUMN setoran_min_bulanan bigint;
UPDATE opsi_kelas_kamar k SET setoran_min_bulanan = (SELECT max(p.setoran_min_bulanan) FROM paket p WHERE p.kelas_kamar = k.nama);
UPDATE opsi_kelas_kamar SET setoran_min_bulanan = 1000000 WHERE setoran_min_bulanan IS NULL;
ALTER TABLE opsi_kelas_kamar ALTER COLUMN setoran_min_bulanan SET NOT NULL, ADD CHECK (setoran_min_bulanan > 0);
