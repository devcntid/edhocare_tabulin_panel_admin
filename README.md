# Tabulin Admin

Panel admin untuk **Tabulin / Pregnancy Savings+ (RS Edelweiss)**: verifikasi pendaftaran, pasang Virtual Account, tagihan DP/bulanan, konfirmasi setoran (buku besar append-only), notifikasi, audit log. Hanya untuk pengembangan lokal (tanpa deploy, tanpa data pasien nyata, tanpa WhatsApp nyata; payment gateway hanya sandbox: Midtrans dan Faspay).

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

**Deploy Vercel:** skrip `vercel-build` menjalankan `db:migrate` sebelum `next build`, hanya bila `VERCEL_ENV=production` (preview dilewati). `DATABASE_URL` harus tersedia di environment Production Vercel untuk tahap build; `MIGRATE_DATABASE_URL` (opsional) dipakai bila migrasi butuh koneksi lain. Bila migrasi gagal, build gagal dan deploy lama tetap berjalan. Migrasi berjalan sebelum kode baru aktif, jadi tulis migrasi yang kompatibel dengan kode lama (tambah kolom/tabel, jangan hapus atau ganti nama dulu).

## Integrasi: setoran dari API
Setoran tidak diinput admin; aplikasi/API bank melaporkannya (idempoten per `referensi`):
```bash
curl -X POST localhost:3000/api/integrasi/setoran \
  -H "Authorization: Bearer $INTEGRATION_API_KEY" -H "Content-Type: application/json" \
  -d '{"no_va":"1234500000000002","referensi":"BCA-0001","tanggal_bayar":"2026-11-13","nominal":2000000,"nomor_tagihan":"INV-0006-02"}'
```
201 = baru dicatat, 200 = referensi sama diulang (tidak dobel). Setoran yang kurang dari tagihan, atau tagihan sudah lunas, dicatat sebagai *Setoran tambahan*. Admin hanya dapat **mengoreksi** (baris negatif).

## Payment gateway
Dua gateway, keduanya hanya untuk sandbox. Setoran dari keduanya tetap lewat fungsi setoran yang sama (`terima_setoran_api`, idempoten pada id pesanan), jadi notifikasi yang terkirim ulang tidak menambah saldo dua kali, dan isi notifikasi tidak dipercaya: status dan nominal dibaca ulang dari gateway.
- **Midtrans Sandbox** (VA bank): `MIDTRANS_*` di `.env.example`; notifikasi ke `POST /api/integrasi/midtrans`.
- **Faspay lewat payment gateway orchestrator** (VA, QRIS, e-wallet, retail): isi `FASPAY_BASE_URL` (alamat gateway, bukan alamat app ini), `FASPAY_CLIENT_ID`, `FASPAY_CLIENT_SECRET`, dan `FASPAY_WEBHOOK_SECRET` (tanda tangan webhook). Pendaftaran URL webhook `https://<host>/api/integrasi/faspay` dan route kanal ada di sisi gateway (script admin `add-route`); tanpa route, checkout kanal itu dijawab `409 KANAL_TIDAK_TERSEDIA`. Terakhir dicoba (19 Nov 2026) hanya e-wallet OVO (812) yang punya route di klien ini; VA, QRIS, dan retail menyusul setelah route ditambahkan. Cek koneksi: `GET $FASPAY_BASE_URL/health`, token `POST /v1/oauth/token` (Basic auth), baca transaksi `GET /v1/transactions/{id}`.
- Kanal Faspay (21 kanal, `kanal_pembayaran.konfigurasi->>'pg_code'`) tersembunyi sampai keuangan menampilkannya di halaman Metode pembayaran. Checkout dari aplikasi: `POST /api/v1/bills/{id}/checkout` dengan `{ "kanal": "<kode metode>" }`. Daftar endpoint: `docs/11-daftar-api.md`.

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
npm test                        # vitest: tests/*.test.ts (memakai TEST_DATABASE_URL, mengosongkan schema-nya); gateway diuji dengan mock, tanpa jaringan
```

## Halaman
Dasbor (kartu + grafik), Pasien (baca saja), Pendaftaran (+ detail & aksi), Notifikasi (log kirim), Templat notifikasi, Tagihan (+ pengingat), Setoran (buku besar), Log setoran API, Metode pembayaran (instruksi pembayaran ada di dalam tiap metode), Jadwal cicilan, Cara persalinan, Kelas kamar, Pengaturan, Audit log, Pengguna.
Cara membuat halaman baru: `docs/08-standar-halaman.md`.
Endpoint untuk app/bank: `POST /api/integrasi/setoran`, `GET /api/integrasi/instruksi` (keduanya `Authorization: Bearer $INTEGRATION_API_KEY`).

## Asumsi yang perlu dikonfirmasi RS Edelweiss
H+1 = tanggal transfer < hari ini; setoran untuk tagihan >= nominal tagihan; jatuh tempo tanggal 10; koreksi membuka kembali tagihan; peran admin; masa kedaluwarsa pendaftaran (saat ini manual); tarif per faskes sama.
