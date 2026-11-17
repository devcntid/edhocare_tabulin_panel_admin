# Tabulin Admin

Panel admin untuk **Tabulin / Pregnancy Savings+ (RS Edelweiss)**: verifikasi pendaftaran, pasang Virtual Account, tagihan DP/bulanan, konfirmasi setoran (buku besar append-only), notifikasi, audit log. Hanya untuk pengembangan lokal (tanpa deploy, tanpa data pasien nyata, tanpa payment gateway/WhatsApp nyata).

Dokumen desain: `docs/06-design-v3.md` (aturan bisnis: `docs/05-mockup-business-logic.md`).

## Prasyarat
- Node >= 20.19 (`nvm use`; Tailwind 4 gagal di Node 20.11)
- PostgreSQL 18 lokal (`brew services start postgresql@18`)

## Menjalankan
```bash
npm install
createdb tabulin && createdb tabulin_test
cp .env.example .env.local      # isi SESSION_SECRET (openssl rand -base64 32), INTEGRATION_API_KEY (min 24 karakter) dan SEED_ADMIN_PASSWORD
npm run db:migrate
npm run db:seed                 # 3 admin + 8 pendaftaran demo (fiktif)
npm run dev                     # http://localhost:3000
```
Login seed (password = `SEED_ADMIN_PASSWORD`): `admin@tabulin.local` (super admin), `admin.program@tabulin.local`, `admin.keuangan@tabulin.local`.

`npm run db:reset` menghapus schema (hanya host localhost), lalu jalankan `db:migrate` dan `db:seed` lagi.

## Integrasi: setoran dari API
Setoran tidak diinput admin; aplikasi/API bank melaporkannya (idempoten per `referensi`):
```bash
curl -X POST localhost:3000/api/integrasi/setoran \
  -H "Authorization: Bearer $INTEGRATION_API_KEY" -H "Content-Type: application/json" \
  -d '{"no_va":"1234500000000002","referensi":"BCA-0001","tanggal_bayar":"2026-11-13","nominal":2000000,"nomor_tagihan":"INV-0006-02"}'
```
201 = baru dicatat, 200 = referensi sama diulang (tidak dobel). Setoran yang kurang dari tagihan, atau tagihan sudah lunas, dicatat sebagai *Setoran tambahan*. Admin hanya dapat **mengoreksi** (baris negatif).

## Peran
| Peran | Akses |
|---|---|
| super_admin | semua, kelola pengguna, produk (paket), dan pengaturan aturan |
| admin_program | setujui/tolak/kedaluwarsa, pendaftaran manual, templat notifikasi |
| keuangan | pasang VA, terbitkan tagihan + pengingat, koreksi setoran, tandai selesai, metode & instruksi pembayaran |

## Struktur
- `db/migrations/*.sql` – schema, fungsi transisi status (aturan bisnis di DB), data referensi; `db/migrate.ts` mencatat checksum di `schema_migrations`
- `lib/services/` – query & aturan tabungan (`tabungan.ts` murni: nominal tagihan, badge, proyeksi)
- `app/api/**` – Route Handlers tipis (sesi, izin, envelope error `{error:{code,message,fields}}`)
- `app/(panel)/**` – halaman admin (server components + form client)
- `proxy.ts` – pengalihan ke `/login` bila tanpa sesi

## Tes & cek
```bash
npm run typecheck && npm run lint && npm run build
psql -d <db_scratch> -v ON_ERROR_STOP=1 -q -f tests/sql/ledger_core.sql   # skenario DB (pada DB hasil migrate); juga integrasi.sql dan cicilan.sql
psql -d <db_scratch> -v ON_ERROR_STOP=1 -q -f tests/sql/integrasi.sql      # templat notifikasi + setoran API
npm test                        # vitest: tabungan.test.ts + db.test.ts (memakai TEST_DATABASE_URL, mengosongkan schema-nya)
```

## Halaman
Dasbor (kartu + grafik), Pasien (baca saja), Pendaftaran (+ detail & aksi), Notifikasi (log kirim), Templat notifikasi, Tagihan (+ pengingat), Setoran (buku besar), Log setoran API, Metode pembayaran, Instruksi pembayaran, Jadwal cicilan, Cara persalinan, Kelas kamar, Pengaturan, Audit log, Pengguna.
Cara membuat halaman baru: `docs/08-standar-halaman.md`.
Endpoint untuk app/bank: `POST /api/integrasi/setoran`, `GET /api/integrasi/instruksi` (keduanya `Authorization: Bearer $INTEGRATION_API_KEY`).

## Asumsi yang perlu dikonfirmasi RS Edelweiss
H+1 = tanggal transfer < hari ini; setoran untuk tagihan >= nominal tagihan; jatuh tempo tanggal 10; koreksi membuka kembali tagihan; peran admin; masa kedaluwarsa pendaftaran (saat ini manual); tarif per faskes sama.
