# 08 – Standar halaman admin

Tujuan: halaman baru tidak dibuat dari nol. Pakai blok standar di bawah, sehingga judul, filter, tabel, angka/uang, dialog, dan aturan hapus sama di semua halaman.

## 1. Halaman daftar (satu tabel per halaman)

Server component. Dua bagian: fungsi query di `lib/services/` dan halaman yang memakai `HalamanDaftar`.

1. **Query** – pakai `lib/services/daftar.ts` (`cari`, `pilih`, `klausa`, `ambilHalaman`). Nilai filter wajib dari allowlist (`FILTER`), jangan memasukkan input pengguna ke SQL.

```ts
export async function daftarContoh(opts: { q?: string; status?: string; page?: number }) {
  const args: unknown[] = [];
  const w = klausa([cari(args, opts.q, ["r.nama", "r.nomor"]), pilih(args, opts.status, FILTER.statusContoh, "r.status")]);
  return ambilHalaman<Baris>({ dari: `contoh r ${w}`, args, page: opts.page, urut: "r.id DESC", pilihan: "r.id, r.nama, r.nominal" });
}
```

2. **Halaman** – `app/(panel)/<nama>/page.tsx`:

```tsx
<HalamanDaftar judul="…" desc="…" basis="/nama" cari="Cari …" params={{ q, status }} data={data} kunci={(r) => r.id}
  filter={[{ name: "status", semua: "Semua status", opsi: […] }]}
  kolom={[{ judul: "Nama", sel: (r) => r.nama }, { judul: "Nominal", tipe: "uang", sel: (r) => r.nominal }]} />
```

Contoh nyata: `app/(panel)/setoran/page.tsx` (sederhana), `tagihan/page.tsx` (kolom aksi bersyarat izin), `pendaftaran/page.tsx` (tombol di header).

3. **Menu** – tambah entri di `SECTIONS` pada `components/app-shell.tsx`.
4. **Izin** – cek `can(user.peran, "<izin>")` di `lib/permissions.ts`; API tetap membungkus dengan `handler(aksi, fn)` (`lib/api.ts`).

## 2. Aturan tampilan

- Judul kolom **rata kiri**, semua. Angka (`tipe: "angka"`) dan uang (`tipe: "uang"`) rata kanan; "Rp" di kiri sel dengan lebar tetap. Kode (No. RM, No. HP, nomor tagihan) rata kiri.
- Status memakai label teks (`Badge`/`StatusAktif`), bukan warna saja.
- Tombol tambah ada di header halaman (`aksi`), bukan di bawah tabel.
- Setiap daftar punya keadaan kosong, kosong-karena-filter (ada "Reset filter"), dan pager standar (bagian 2b).
- Pilihan entitas (pasien, faskes, cara, kelas) memakai `SelectCari`, bukan ketik manual.

## 2b. Pagination (wajib untuk semua daftar)

Satu komponen untuk semua: `Pager` (`components/table.tsx`). Isinya: rentang data ("Menampilkan 1–15 dari 120 data"), pilihan baris per halaman (10, 15, 25, 50; bawaan 15), tombol pertama «, sebelumnya ‹, nomor halaman dengan "…", berikutnya ›, dan terakhir ».

- **Daftar dari database** (pendaftaran, pasien, tagihan, setoran, dll.): memakai `ambilHalaman` (`lib/services/daftar.ts`) dan `HalamanDaftar`; halaman membaca `page` dan `per` dari URL dengan `pageNum(sp.page)` dan `perNum(sp.per)`. Query memakai LIMIT/OFFSET di server.
- **Daftar kecil yang sudah dimuat utuh** (data master, pengguna): `potong(daftar, page, per)` dari `lib/services/daftar.ts` menghasilkan bentuk yang sama, lalu render `<Pager basis params page pages total per />` di bawah `Table`.
- **Beberapa tabel dalam satu halaman** (detail pendaftaran, detail pasien): beri tiap `Pager` `awalan` sendiri (`bb` menjadi `bb_page` dan `bb_per`) dan `jangkar` (id `Section`), supaya pindah halaman di satu tabel tidak mengubah tabel lain dan layar tidak melompat ke atas.
- Ukuran halaman hanya dari allowlist `PER_HALAMAN` (`lib/paging.ts`); nilai lain jatuh ke 15. Ekspor CSV/PDF tidak dipaginasi.

## 3. Data master dengan CRUD (dialog)

- Form dalam `FormDialog` + `Field`; uang dengan `InputRp`; baris tabel memakai `AksiBaris`/`btnBaris`.
- Contoh lengkap: `components/master-panel.tsx` (cara persalinan, kelas kamar), `app/(panel)/pembayaran`, `templat`, `pengguna`.
- **Hapus hanya jika belum dipakai**: `components/hapus-button.tsx` + `lib/services/hapus.ts` (cek pemakaian per entitas, tulis audit). Yang sudah dipakai hanya disembunyikan/dinonaktifkan ("Tampilkan/Sembunyikan" untuk yang muncul di pilihan aplikasi, "Aktif/Nonaktif" untuk pengguna).
- Hal yang terikat fungsi/trigger DB (variabel templat, aturan Pengaturan) hanya boleh diubah nilainya, tidak ditambah atau dihapus.
- Setiap perubahan tulis ke `audit_log`.

## 3b. Daftar data transaksi (pendaftaran, pasien, tagihan, setoran, jadwal cicilan, notifikasi)

Data ini punya halaman detail dengan aksi yang bergantung status, jadi daftarnya tidak diedit di tempat.

- **Tombol Detail wajib** di kolom terakhir tiap baris: kolom `{ judul: "Aksi", tipe: "aksi", sel: (r) => <TombolDetail href=... /> }` di `HalamanDaftar` (`TombolDetail` dari `components/page.tsx`, kelas `btnBaris` dari `components/ui.ts`). Nomor atau nama yang tertaut boleh tetap ada sebagai jalan pintas, tetapi bukan satu-satunya jalan masuk.
- **Aksi ber-status ada di halaman detail** (setujui, tolak, pasang VA, terbitkan tagihan, tandai selesai, koreksi, konfirmasi setoran), karena admin perlu melihat saldo, tagihan, dan buku besar dulu.
- **Pintasan hanya untuk aksi yang sering dan jelas konteksnya.** Contoh: di `/tagihan`, baris yang belum lunas dan pendaftarannya aktif punya tombol "Konfirmasi setoran" (komponen `components/konfirmasi-setoran.tsx`, dipakai juga di detail pendaftaran) dan "Kirim pengingat". Aturan bisnisnya tetap di fungsi DB, jadi pintasan dan detail memberi hasil yang sama.
- Pintasan dibungkus izin (`can(user.peran, ...)`), sama seperti API-nya.
- Data master (bagian 3) tetap memakai dialog Ubah/Hapus di baris.

## 4. Kartu ringkasan dan detail

`Stat`/`StatGrid` untuk angka ringkasan, `Info`/`InfoGrid` untuk pasangan label-nilai (`components/stat.tsx`). Judul halaman memakai `PageHeader`, bagian dalam halaman memakai `Section` (`components/page.tsx`).

## 5. Daftar periksa halaman baru

- [ ] Memakai `HalamanDaftar` atau `Halaman` + `PageHeader`.
- [ ] Pencarian/filter dari URL, filter dari allowlist, pagination server-side.
- [ ] Angka dan uang memakai tipe kolom standar.
- [ ] Izin dicek di halaman dan di API; deny by default.
- [ ] Aksi tulis masuk audit log; hapus mengikuti aturan "belum dipakai".
- [ ] Daftar data transaksi punya tombol Detail di kolom Aksi (bagian 3b); data master punya Ubah/Hapus di baris (bagian 3).
- [ ] Kontras dan label dapat dibaca (WCAG AA), tidak bergantung warna saja.
- [ ] `npm run typecheck && npm run lint`, lalu cek halaman di browser.
