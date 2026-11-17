-- Products (paket) can be deactivated, never deleted: registrations keep a price snapshot and reference the paket.
ALTER TABLE paket ADD COLUMN aktif boolean NOT NULL DEFAULT true;
