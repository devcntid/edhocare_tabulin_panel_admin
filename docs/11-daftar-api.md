# 11 – Daftar API Tabulin

Daftar semua endpoint dan fungsinya. Hanya list dan fungsi, bukan spesifikasi lengkap (skema field ada di kode: `app/api/**/route.ts` dan `lib/services/*`; kontrak aplikasi pasien ada di `07-kontrak-data.md`). Per 2026-11-17, **56 endpoint** dalam 4 kelompok.

## Cara membaca

| Kelompok | Autentikasi | Bentuk respons |
|---|---|---|
| **A. Admin** (`/api/...`) | Sesi login (cookie httpOnly). Untuk method selain GET, header `Origin` harus sama dengan host. | Sukses `{"data": ...}`, galat `{"error": {"code","message","fields"}}` |
| **B. Mesin ke mesin** (`/api/integrasi/*`) | `Authorization: Bearer <INTEGRATION_API_KEY>` | Sama dengan A |
| **C. Aplikasi pasien** (`/api/v1/*`) | `Authorization: Bearer <token pasien>` (dari B `token`), kecuali unduhan PDF kuitansi | Respons gaya kontrak, kode galat `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, dan seterusnya |
| **D. Berkas** (unduhan) | Sesi admin | File, bukan JSON |

Izin admin (`lib/permissions.ts`):

| Izin | Peran yang boleh |
|---|---|
| `lihat` | super_admin, admin_program, keuangan |
| `verifikasi` | super_admin, admin_program |
| `keuangan` | super_admin, keuangan |
| `kelola_paket`, `kelola_pengguna` | super_admin |

---

## A. Admin

### Sesi dan sistem

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| POST | `/api/auth/login` | Login email dan password. Batas 5 gagal per email per 15 menit. | publik |
| POST | `/api/auth/logout` | Hapus cookie sesi. | sesi |
| GET | `/api/health` | Cek aplikasi dan database (jumlah migrasi). | publik |

### Pendaftaran dan keuangan per pendaftaran

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| GET | `/api/pendaftaran` | Daftar pendaftaran. Query: `q`, `status`, `page`. | lihat |
| POST | `/api/pendaftaran` | Buat pendaftaran manual (`no_rm`, `faskes_id`, `cara_persalinan`, `kelas_kamar`, `jumlah_cicilan`, `hpht`). | verifikasi |
| GET | `/api/pendaftaran/{id}` | Detail: ringkasan, tagihan, transaksi, jadwal cicilan, notifikasi, riwayat audit. | lihat |
| POST | `/api/pendaftaran/{id}/setujui` | Setujui pendaftaran (menunggu_verifikasi → va_disiapkan). | verifikasi |
| POST | `/api/pendaftaran/{id}/tolak` | Tolak dengan `alasan`. | verifikasi |
| POST | `/api/pendaftaran/{id}/kedaluwarsa` | Tandai kedaluwarsa. | verifikasi |
| POST | `/api/pendaftaran/{id}/pasang-va` | Pasang nomor VA (16 digit; kosong = dibuat otomatis), terbitkan tagihan DP, status menjadi `aktif`. | keuangan |
| POST | `/api/pendaftaran/{id}/tagihan` | Terbitkan tagihan bulanan (`periode` YYYY-MM, opsional). | keuangan |
| POST | `/api/pendaftaran/{id}/setoran` | Konfirmasi setoran manual dari transfer bank manual atau tunai yang sudah dicek (`tanggal_bayar`, `nominal`, `kanal_id` wajib, `tagihan_id` opsional). `kanal_id` harus metode aktif berjenis `transfer_manual` atau `tunai`, selain itu ditolak (409 `METODE_TIDAK_VALID`); metode tercatat di transaksi. Tanggal harus sebelum hari ini (H+1), nominal tidak boleh kurang dari tagihan. Hanya untuk jalur manual: tagihan yang punya pembayaran gateway berstatus menunggu ditolak (409 `MENUNGGU_GATEWAY`), karena callback gateway yang mengkonfirmasinya. Menambah saldo, melunasi tagihan, mengirim notifikasi. | keuangan |
| POST | `/api/pendaftaran/{id}/selesai` | Tandai program selesai. | keuangan |
| POST | `/api/tagihan/{id}/pengingat` | Kirim pengingat tagihan (notifikasi dari templat). | keuangan |
| POST | `/api/transaksi/{id}/koreksi` | Koreksi transaksi dengan `alasan` (buku besar append-only: dibuat baris koreksi, bukan ubah). | keuangan |

### Klaim pembayaran (fitur K9, mati secara default)

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| POST | `/api/klaim/{id}/tolak` | Tolak klaim transfer dengan `alasan`. Pasien diberi notifikasi. | keuangan |

### Data master dan aturan

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| POST | `/api/master/{jenis}` | Tambah cara persalinan (`jenis=cara`) atau kelas kamar (`jenis=kelas`, dengan `tier` dan `setoran_min_bulanan`), plus `harga` per faskes. | kelola_paket |
| PATCH | `/api/master/{jenis}/{id}` | Ubah nama, tier, setoran minimum, `aktif`, atau harga per faskes. | kelola_paket |
| POST | `/api/faskes` | Tambah faskes (`kode`, `nama`, alamat, telepon, email). | kelola_paket |
| PATCH | `/api/faskes/{id}` | Ubah data faskes atau nonaktifkan (kode tidak bisa diubah). | kelola_paket |
| PATCH | `/api/konfigurasi/{kunci}` | Ubah satu aturan angka dalam rentang yang diizinkan: `dp_persen`, `target_persen`, `milestone_minggu`, `hpl_minggu`, `batas_usia_kehamilan_hari`, `hari_jatuh_tempo`, `hari_tempo_dp`, `toleransi_hari`, `fitur_klaim_aktif`. | kelola_paket |

### Pembayaran dan notifikasi

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| POST | `/api/pembayaran/kanal` | Tambah metode pembayaran (`kode`, `nama`, `deskripsi`, `jenis`: `va`, `transfer_manual`, atau `tunai`; bawaan `va`). Metode baru nonaktif. | keuangan |
| PATCH | `/api/pembayaran/kanal/{id}` | Ubah nama, deskripsi, `jenis`, atau `aktif`. | keuangan |
| POST | `/api/pembayaran/instruksi` | Tambah instruksi pembayaran (bank, rekening, langkah). | keuangan |
| PATCH | `/api/pembayaran/instruksi/{id}` | Ubah instruksi. | keuangan |
| PATCH | `/api/templat/{kode}` | Ubah templat notifikasi (nama, kategori, judul, isi, `aktif`). | verifikasi |

### Pengguna

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| GET | `/api/pengguna` | Daftar pengguna admin. | kelola_pengguna |
| POST | `/api/pengguna` | Buat pengguna (email, nama, peran, password minimal 10 karakter). | kelola_pengguna |
| PATCH | `/api/pengguna/{id}` | Aktif/nonaktifkan atau ganti password. | kelola_pengguna |

### Hapus

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| DELETE | `/api/hapus/{entitas}/{id}` | Hapus data yang belum dipakai. `entitas`: `pengguna`, `templat`, `kanal`, `instruksi`, `faskes`, `cara`, `kelas`. Jika sudah dipakai, ditolak dan data cukup dinonaktifkan. Izin dicek per entitas di dalam fungsi. | sesuai entitas |

### Ekspor dan impor

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| GET | `/api/ekspor/{dataset}` | Unduh daftar sebagai CSV atau PDF. Query: `format=csv\|pdf`, `q`, dan filter halaman (`status`, `jenis`, `kategori`, `hasil`). `dataset`: `pendaftaran`, `pasien`, `tagihan`, `setoran`, `jadwal-cicilan`, `notifikasi`, `log-api`, `audit`. Maksimal 10.000 baris, tiap ekspor dicatat di audit log. | lihat (`audit`: kelola_pengguna) |
| GET | `/api/impor/pendaftaran/templat` | Unduh templat CSV impor. | verifikasi |
| POST | `/api/impor/pendaftaran` | Impor pendaftaran dari CSV (multipart `file`, `periksa=1` untuk hanya memeriksa). Semua baris disimpan atau tidak sama sekali. Maksimal 500 baris, 1 MB. | verifikasi |

---

## B. Mesin ke mesin (kunci API)

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/integrasi/token` | Terbitkan token pasien untuk `no_rm` yang dikenal (pengganti login Portal Pasien sampai RS menyediakannya). |
| POST | `/api/integrasi/setoran` | Terima setoran dari bank atau aplikasi (`no_va`, `referensi`, `tanggal_bayar`, `nominal`, `nomor_tagihan` opsional). Idempotent pada `referensi`. Tiap panggilan dicatat di log setoran API. Jalan masuk setoran dari bank atau aplikasi. |
| POST | `/api/integrasi/midtrans` | Notifikasi pembayaran Midtrans Sandbox. Diautentikasi dengan `signature_key` (SHA512), bukan Bearer. Settlement menambah saldo lewat fungsi setoran yang sama (idempotent pada `order_id`), tercatat di log setoran API. |
| GET | `/api/integrasi/instruksi` | Instruksi pembayaran yang aktif untuk ditampilkan di aplikasi. |

---

## C. Aplikasi pasien (`/api/v1`)

Kode E-xx mengikuti kontrak. Daftar memakai paginasi cursor (`limit` 1–50, `cursor`).

| Kode | Method | Path | Fungsi |
|---|---|---|---|
| E-01 | GET | `/api/v1/program` | Info program dan konfigurasi (termasuk saklar `fitur_klaim_aktif`, batas bukti, daftar bank). |
| E-02 | GET | `/api/v1/packages` | Katalog paket dan tarif per faskes. Query: `kode_faskes`. |
| E-03 | POST | `/api/v1/simulations` | Simulasi tabungan dari pilihan paket dan HPHT (DP, target, saran setoran). |
| E-04 | POST | `/api/v1/enrollments` | Pasien mendaftar program. Mendukung `Idempotency-Key`. Wajib persetujuan dengan versi teks terbaru. |
| E-05 | GET | `/api/v1/enrollments/me` | Status pendaftaran, rencana, dan profil milik pasien. |
| E-06 | GET | `/api/v1/bills` | Daftar tagihan. Query: `kelompok=aktif\|riwayat\|semua`. |
| E-07 | GET | `/api/v1/bills/{id}` | Detail satu tagihan, termasuk klaim terkait. |
| - | POST | `/api/v1/bills/{id}/checkout` | Buat VA pembayaran Midtrans Sandbox untuk tagihan (`bank` opsional, bawaan `bca`). Tagihan harus milik pasien, belum lunas, pendaftaran aktif. |
| E-08 | GET | `/api/v1/ledger` | Riwayat transaksi (buku besar). Query: `jenis_transaksi`, `bulan` (YYYY-MM). |
| E-09 | GET | `/api/v1/receipt` | Data kuitansi satu transaksi (`id_transaksi`) beserta tautan PDF bertanda tangan (berlaku 15 menit). |
| (E-09) | GET | `/api/v1/receipt/{id}/pdf?token=` | Unduh PDF kuitansi. Diizinkan oleh token di URL, tanpa Bearer. |
| E-10 | POST | `/api/v1/devices` | Daftarkan perangkat untuk notifikasi (`token_fcm`, `platform`, `id_perangkat`). |
| E-11 | GET | `/api/v1/notifications` | Daftar notifikasi dan jumlah yang belum dibaca. |
| E-12 | PATCH | `/api/v1/notifications` | Tandai dibaca: `id_notifikasi` (daftar) atau `semua: true`. |
| E-13 | POST | `/api/v1/payment-claims` | Lapor transfer dengan bukti (multipart: `id_tagihan`, `nominal_transfer`, `tanggal_transfer`, `bank_asal`, `nama_pengirim`, `file_bukti`). Mendukung `Idempotency-Key`. Tidak mengubah saldo. **Butuh `fitur_klaim_aktif`=1**, jika mati 403 `FITUR_TIDAK_AKTIF`. |
| E-14 | DELETE | `/api/v1/devices/{id}` | Lepas perangkat. |
| E-15 | GET | `/api/v1/payment-claims` | Daftar klaim milik pasien. Query: `id_tagihan`, `status_klaim`. **Butuh `fitur_klaim_aktif`=1.** |

---

## D. Berkas untuk admin

| Method | Path | Fungsi | Izin |
|---|---|---|---|
| GET | `/api/klaim/{id}/berkas` | Lihat bukti transfer yang diunggah pasien (inline, sandbox). | lihat |
| GET | `/api/transaksi/{id}/bukti` | Unduh PDF kuitansi satu transaksi. | lihat |

---

## Catatan

- Setoran masuk lewat tiga jalur: `POST /api/integrasi/setoran`, notifikasi gateway `POST /api/integrasi/midtrans`, atau konfirmasi manual keuangan `POST /api/pendaftaran/{id}/setoran` (H+1). Admin selain itu hanya mengoreksi, dan data pasien tidak bisa diubah dari panel.
- Klaim (E-13, E-15) tidak pernah mengubah saldo. Saldo hanya bertambah saat setoran sungguhan masuk, dan klaim otomatis menjadi `dikonfirmasi`.
- Halaman panel (bukan API) ada di `app/(panel)/`; aturan halaman daftar di `08-standar-halaman.md`.
- Cara menambah endpoint baru: bungkus dengan `handler(aksi, fn)` (`lib/api.ts`) untuk admin, `appHandler` (`lib/app-api.ts`) untuk aplikasi pasien.
