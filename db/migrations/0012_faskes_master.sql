-- Faskes becomes an admin-managed master: contact details beside the existing kode, nama and aktif.
ALTER TABLE faskes ADD COLUMN alamat text, ADD COLUMN no_telepon text, ADD COLUMN email text;
