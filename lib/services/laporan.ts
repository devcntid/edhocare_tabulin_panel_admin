import { pool } from "@/lib/db";
import { ambilHalaman, cari, klausa, pilih, FILTER, paging, pages } from "@/lib/services/daftar";
import { konfig, today } from "@/lib/services/pendaftaran";

export { FILTER };
import { badgeInfo, type TagihanLite } from "@/lib/services/tabungan";

export type NotifAdmin = { kunci: string; label: string; jumlah: number; href: string };

/** Notifications for the admin (bell and sidebar badge): work waiting for them. Not the messages sent to participants (/notifikasi). */
export async function notifikasiAdmin(): Promise<NotifAdmin[]> {
  const r = await pool.query(
    `SELECT (SELECT count(*) FROM pendaftaran WHERE status_pendaftaran = 'menunggu_verifikasi')::int AS verifikasi,
            (SELECT count(*) FROM pendaftaran WHERE status_pendaftaran = 'va_disiapkan')::int AS va,
            (SELECT count(*) FROM v_tagihan_status g JOIN pendaftaran p ON p.id = g.pendaftaran_id
              WHERE p.status_pendaftaran = 'aktif' AND g.status_tampil = 'lewat_jatuh_tempo')::int AS lewat`);
  const n = r.rows[0];
  return [
    { kunci: "verifikasi", label: "Pendaftaran menunggu verifikasi", jumlah: n.verifikasi, href: "/pendaftaran?status=menunggu_verifikasi" },
    { kunci: "va", label: "Pendaftaran menunggu pemasangan VA", jumlah: n.va, href: "/pendaftaran?status=va_disiapkan" },
    { kunci: "lewat", label: "Tagihan lewat jatuh tempo", jumlah: n.lewat, href: "/tagihan?status=lewat_jatuh_tempo" },
  ];
}

export async function dasbor() {
  const [hitung, menunggu, aktif, tagihan, cfg, hariIni, setoranBulan, serieSetoran, seriePendaftaran, serieTagihan, perKelas, ringkas, terbaru, tempo, aktivitas, pendaftaranBaru] = await Promise.all([
    pool.query("SELECT status_pendaftaran AS s, count(*)::int AS n FROM pendaftaran GROUP BY 1"),
    pool.query("SELECT id, nomor, nama, dibuat_pada FROM pendaftaran WHERE status_pendaftaran = 'menunggu_verifikasi' ORDER BY id LIMIT 8"),
    pool.query("SELECT v.*, f.nama AS faskes FROM v_pendaftaran_ringkas v JOIN faskes f ON f.id = v.faskes_id WHERE v.status_pendaftaran = 'aktif'"),
    pool.query(
      `SELECT g.*, p.nama, p.nomor AS nomor_pendaftaran FROM v_tagihan_status g JOIN pendaftaran p ON p.id = g.pendaftaran_id
       WHERE p.status_pendaftaran = 'aktif' AND g.status = 'belum_dibayar'`),
    konfig(),
    today(),
    pool.query("SELECT COALESCE(sum(nominal_transaksi),0)::bigint AS total FROM transaksi WHERE date_trunc('month', tanggal_bayar) = date_trunc('month', today_jkt())"),
    pool.query(
      `SELECT to_char(m, 'YYYY-MM') AS periode, COALESCE(sum(t.nominal_transaksi), 0)::bigint AS nilai
       FROM generate_series(date_trunc('month', today_jkt()) - interval '5 months', date_trunc('month', today_jkt()), interval '1 month') m
       LEFT JOIN transaksi t ON date_trunc('month', t.tanggal_bayar) = m GROUP BY m ORDER BY m`),
    pool.query(
      `SELECT to_char(m, 'YYYY-MM') AS periode, count(p.id)::int AS nilai
       FROM generate_series(date_trunc('month', today_jkt()) - interval '5 months', date_trunc('month', today_jkt()), interval '1 month') m
       LEFT JOIN pendaftaran p ON date_trunc('month', p.dibuat_pada AT TIME ZONE 'Asia/Jakarta') = m GROUP BY m ORDER BY m`),
    pool.query(
      `SELECT to_char(m, 'YYYY-MM') AS periode, COALESCE(sum(g.nominal), 0)::bigint AS nilai
       FROM generate_series(date_trunc('month', today_jkt()), date_trunc('month', today_jkt()) + interval '5 months', interval '1 month') m
       LEFT JOIN (SELECT g.nominal, g.jatuh_tempo FROM tagihan g JOIN pendaftaran r ON r.id = g.pendaftaran_id
                  WHERE g.status = 'belum_dibayar' AND r.status_pendaftaran = 'aktif') g ON date_trunc('month', g.jatuh_tempo) = m
       GROUP BY m ORDER BY m`),
    pool.query(
      `SELECT k.kelas_kamar AS label, count(*)::int AS nilai FROM pendaftaran p JOIN paket k ON k.id = p.paket_id
       WHERE p.status_pendaftaran IN ('aktif','selesai','va_disiapkan','menunggu_verifikasi') GROUP BY k.kelas_kamar ORDER BY nilai DESC, label`),
    pool.query(
      `SELECT (SELECT count(*) FROM pasien)::int AS pasien,
              (SELECT count(*) FROM transaksi WHERE nominal_transaksi > 0)::int AS transaksi,
              (SELECT count(*) FROM tagihan)::int AS tagihan,
              (SELECT COALESCE(sum(g.nominal),0) FROM tagihan g JOIN pendaftaran r ON r.id = g.pendaftaran_id WHERE g.status = 'belum_dibayar' AND r.status_pendaftaran = 'aktif')::bigint AS piutang,
              (SELECT COALESCE(sum(nominal_transaksi),0) FROM transaksi)::bigint AS diterima`),
    pool.query(
      `SELECT t.nomor, t.jenis, t.nominal_transaksi, t.tanggal_bayar, t.sumber, r.id AS pid, r.nama
       FROM transaksi t JOIN pendaftaran r ON r.id = t.pendaftaran_id ORDER BY t.id DESC LIMIT 6`),
    pool.query(
      `SELECT g.id, g.nomor, g.nominal, g.jatuh_tempo, g.status_tampil, r.id AS pid, r.nama
       FROM v_tagihan_status g JOIN pendaftaran r ON r.id = g.pendaftaran_id
       WHERE g.status = 'belum_dibayar' AND r.status_pendaftaran = 'aktif' ORDER BY g.jatuh_tempo, g.id LIMIT 8`),
    pool.query(
      `SELECT l.id, l.aksi, l.entitas, l.entitas_id, l.dibuat_pada, a.nama AS admin_nama
       FROM audit_log l LEFT JOIN pengguna_admin a ON a.id = l.pengguna_id ORDER BY l.id DESC LIMIT 6`),
    pool.query("SELECT id, nomor, nama, dibuat_pada, status_pendaftaran FROM pendaftaran ORDER BY id DESC LIMIT 5"),
  ]);
  const perStatus = Object.fromEntries(hitung.rows.map((r) => [r.s, r.n])) as Record<string, number>;
  const byPend = new Map<number, TagihanLite[]>();
  for (const t of tagihan.rows) byPend.set(t.pendaftaran_id, [...(byPend.get(t.pendaftaran_id) ?? []), t]);
  const tertinggal = [];
  const kondisi = { sesuai_jalur: 0, tertinggal: 0, tercapai: 0 };
  for (const p of aktif.rows) {
    const b = badgeInfo(p, p.jenis_rencana, p.saldo, byPend.get(p.id) ?? [], hariIni, cfg.hari, cfg.toleransi);
    kondisi[b.badge]++;
    if (b.badge === "tertinggal") tertinggal.push({ id: p.id, nomor: p.nomor, nama: p.nama, saldo: p.saldo, selisih: b.selisih_rencana });
  }
  return {
    perStatus,
    totalSaldo: aktif.rows.reduce((s, p) => s + p.saldo, 0),
    setoranBulanIni: setoranBulan.rows[0].total as number,
    menunggu: menunggu.rows as { id: number; nomor: string; nama: string; dibuat_pada: string }[],
    lewatTempo: tagihan.rows.filter((t) => t.status_tampil === "lewat_jatuh_tempo").length,
    tertinggal,
    kondisi,
    serieSetoran: serieSetoran.rows as { periode: string; nilai: number }[],
    seriePendaftaran: seriePendaftaran.rows as { periode: string; nilai: number }[],
    serieTagihan: serieTagihan.rows as { periode: string; nilai: number }[],
    perKelas: perKelas.rows as { label: string; nilai: number }[],
    ringkas: ringkas.rows[0] as { pasien: number; transaksi: number; tagihan: number; piutang: number; diterima: number },
    terbaru: terbaru.rows as { nomor: string; jenis: string; nominal_transaksi: number; tanggal_bayar: string; sumber: string; pid: number; nama: string }[],
    tempo: tempo.rows as { id: number; nomor: string; nominal: number; jatuh_tempo: string; status_tampil: string; pid: number; nama: string }[],
    pendaftaranBaru: pendaftaranBaru.rows as { id: number; nomor: string; nama: string; dibuat_pada: string; status_pendaftaran: string }[],
    aktivitas: aktivitas.rows as { id: number; aksi: string; entitas: string; entitas_id: number | null; dibuat_pada: string; admin_nama: string | null }[],
  };
}

export async function daftarTagihan(opts: { q?: string; status?: string; page?: number; per?: number; semua?: boolean }) {
  const args: unknown[] = [];
  const w = klausa([cari(args, opts.q, ["g.nomor", "r.nama", "r.nomor"]), pilih(args, opts.status, FILTER.statusTagihan, "g.status_tampil")]);
  return ambilHalaman<{ id: number; nomor: string; jenis: string; periode: string; nominal: number; terbit_pada: string; jatuh_tempo: string; status_tampil: string; pendaftaran_id: number; nama: string; nomor_pendaftaran: string; status_pendaftaran: string }>({
    dari: `v_tagihan_status g JOIN pendaftaran r ON r.id = g.pendaftaran_id ${w}`, args, page: opts.page, per: opts.per, semua: opts.semua, urut: "g.id DESC",
    pilihan: "g.id, g.nomor, g.jenis, g.periode, g.nominal, g.terbit_pada, g.jatuh_tempo, g.status_tampil, g.pendaftaran_id, r.nama, r.nomor AS nomor_pendaftaran, r.status_pendaftaran",
  });
}

export async function daftarTransaksi(opts: { q?: string; jenis?: string; page?: number; per?: number; semua?: boolean }) {
  const args: unknown[] = [];
  const w = klausa([cari(args, opts.q, ["t.nomor", "r.nama", "r.nomor"]), pilih(args, opts.jenis, FILTER.jenisTransaksi, "t.jenis")]);
  return ambilHalaman<{ id: number; nomor: string; jenis: string; nominal_transaksi: number; tanggal_bayar: string; tanggal_konfirmasi: string; saldo_setelah: number; keterangan: string | null; pendaftaran_id: number; nama: string; nomor_pendaftaran: string }>({
    dari: `transaksi t JOIN pendaftaran r ON r.id = t.pendaftaran_id ${w}`, args, page: opts.page, per: opts.per, semua: opts.semua, urut: "t.id DESC",
    pilihan: "t.id, t.nomor, t.jenis, t.nominal_transaksi, t.tanggal_bayar, t.tanggal_konfirmasi, t.saldo_setelah, t.keterangan, t.pendaftaran_id, r.nama, r.nomor AS nomor_pendaftaran",
  });
}

export async function daftarNotifikasi(opts: { q?: string; kategori?: string; page?: number; per?: number; semua?: boolean }) {
  const args: unknown[] = [];
  const w = klausa([cari(args, opts.q, ["n.judul", "r.nama", "n.templat_kode"]), pilih(args, opts.kategori, FILTER.kategoriNotifikasi, "n.kategori")]);
  return ambilHalaman<{ id: number; kategori: string; judul: string; isi: string; tujuan: string; tujuan_ref: string | null; dibuat_pada: string; pendaftaran_id: number; templat_kode: string | null; kanal: string; status_kirim: string; galat: string | null; nama: string }>({
    dari: `notifikasi n JOIN pendaftaran r ON r.id = n.pendaftaran_id ${w}`, args, page: opts.page, per: opts.per, semua: opts.semua, urut: "n.id DESC",
    pilihan: "n.id, n.kategori, n.judul, n.isi, n.tujuan, n.tujuan_ref, n.dibuat_pada, n.pendaftaran_id, n.templat_kode, n.kanal, n.status_kirim, n.galat, r.nama",
  });
}

export async function daftarAudit(opts: { q?: string; page?: number; per?: number; semua?: boolean }) {
  const args: unknown[] = [];
  const w = klausa([cari(args, opts.q, ["l.aksi", "l.entitas", "a.nama"])]);
  return ambilHalaman<{ id: number; aksi: string; entitas: string; entitas_id: number | null; sesudah: unknown; dibuat_pada: string; admin_nama: string | null }>({
    dari: `audit_log l LEFT JOIN pengguna_admin a ON a.id = l.pengguna_id ${w}`, args, page: opts.page, per: opts.per, semua: opts.semua, urut: "l.id DESC",
    pilihan: "l.id, l.aksi, l.entitas, l.entitas_id, l.sesudah, l.dibuat_pada, a.nama AS admin_nama",
  });
}

export async function daftarKonfigurasi() {
  return (await pool.query("SELECT kunci, nilai FROM konfigurasi ORDER BY kunci")).rows as { kunci: string; nilai: unknown }[];
}

/** Patients are read-only master data (to be filled from the hospital/customer-app API). */
export async function daftarPasien(opts: { q?: string; page?: number; per?: number; semua?: boolean }) {
  const { p, per, limit, offset } = paging(opts.page, opts.semua, opts.per);
  const args: unknown[] = [];
  let w = "";
  if (opts.q?.trim()) {
    args.push(`%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%`);
    w = "WHERE nama ILIKE $1 OR no_rm ILIKE $1 OR no_hp ILIKE $1";
  }
  const base = `
    SELECT p.no_rm, p.nama, p.no_hp, l.status_pendaftaran AS status_terakhir, l.id AS pendaftaran_id,
           COALESCE(c.jumlah, 0) AS jumlah, COALESCE(c.saldo, 0)::bigint AS total_saldo
    FROM pasien p
    LEFT JOIN LATERAL (SELECT id, status_pendaftaran FROM pendaftaran d WHERE d.no_rm = p.no_rm ORDER BY id DESC LIMIT 1) l ON true
    LEFT JOIN LATERAL (SELECT count(*)::int AS jumlah, sum(saldo) AS saldo FROM v_pendaftaran_ringkas v WHERE v.no_rm = p.no_rm) c ON true`;
  const total = (await pool.query(`SELECT count(*)::int AS n FROM (${base}) x ${w}`, args)).rows[0].n as number;
  const { rows } = await pool.query(`SELECT * FROM (${base}) x ${w} ORDER BY nama LIMIT ${limit} OFFSET ${offset}`, args);
  return { rows, total, page: p, per, pages: pages(total, per) };
}

export async function detailPasien(noRm: string) {
  const [pend, trx] = await Promise.all([
    pool.query(
      `SELECT v.id, v.nomor, v.nama, v.no_hp, v.status_pendaftaran, v.saldo, v.dibuat_pada, f.nama AS faskes, k.kelas_kamar, k.cara_persalinan
       FROM v_pendaftaran_ringkas v JOIN faskes f ON f.id = v.faskes_id JOIN paket k ON k.id = v.paket_id WHERE v.no_rm = $1 ORDER BY v.id DESC`, [noRm]),
    pool.query(
      `SELECT t.nomor, t.jenis, t.nominal_transaksi, t.tanggal_bayar, t.saldo_setelah, r.nomor AS nomor_pendaftaran
       FROM transaksi t JOIN pendaftaran r ON r.id = t.pendaftaran_id WHERE r.no_rm = $1 ORDER BY t.id DESC`, [noRm]),
  ]);
  const profil = (await pool.query("SELECT no_rm, nama, no_hp FROM pasien WHERE no_rm = $1", [noRm])).rows[0] as { no_rm: string; nama: string; no_hp: string } | undefined;
  return { profil, pendaftaran: pend.rows, transaksi: trx.rows };
}

export async function daftarTemplat() {
  return (await pool.query("SELECT kode, nama, kategori, judul, isi, variabel, aktif, diubah_pada, (SELECT count(*)::int FROM notifikasi n WHERE n.templat_kode = templat_notifikasi.kode) AS dipakai FROM templat_notifikasi ORDER BY kategori, kode")).rows as
    { kode: string; nama: string; kategori: string; judul: string; isi: string; variabel: string[]; aktif: boolean; diubah_pada: string; dipakai: number }[];
}

export async function daftarKanal() {
  const [kanal, instruksi] = await Promise.all([
    pool.query("SELECT id, kode, nama, deskripsi, aktif FROM kanal_pembayaran ORDER BY id"),
    pool.query("SELECT id, kanal_id, judul, isi, nama_bank, nama_rekening, nomor_rekening, aktif FROM instruksi_pembayaran ORDER BY kanal_id, urutan, id"),
  ]);
  return { kanal: kanal.rows as { id: number; kode: string; nama: string; deskripsi: string | null; aktif: boolean }[], instruksi: instruksi.rows as
    { id: number; kanal_id: number; judul: string; isi: string; nama_bank: string | null; nama_rekening: string | null; nomor_rekening: string | null; aktif: boolean }[] };
}

export async function daftarLogApi(opts: { q?: string; hasil?: string; page?: number; per?: number; semua?: boolean }) {
  const args: unknown[] = [];
  const w = klausa([cari(args, opts.q, ["l.no_va", "l.referensi", "l.nomor_transaksi"]), pilih(args, opts.hasil, FILTER.hasilApi, "l.hasil")]);
  return ambilHalaman<{ id: number; diterima_pada: string; no_va: string | null; referensi: string | null; tanggal_bayar: string | null; nominal: number | null; hasil: string; nomor_transaksi: string | null; kode_galat: string | null; pesan: string | null }>({
    dari: `log_setoran_api l ${w}`, args, page: opts.page, per: opts.per, semua: opts.semua, urut: "l.id DESC", pilihan: "l.*",
  });
}

export async function daftarJadwal(opts: { q?: string; status?: string; page?: number; per?: number; semua?: boolean }) {
  const args: unknown[] = [];
  const w = klausa([cari(args, opts.q, ["r.nama", "r.nomor", "j.nomor_tagihan"]), pilih(args, opts.status, FILTER.statusJadwal, "j.status_tampil")]);
  return ambilHalaman<{ id: number; pendaftaran_id: number; urutan: number; periode: string; jatuh_tempo: string; nominal: number; status_tampil: string; nomor_tagihan: string | null; nama: string; nomor: string; jumlah_cicilan: number }>({
    dari: `v_jadwal_cicilan j JOIN pendaftaran r ON r.id = j.pendaftaran_id ${w}`, args, page: opts.page, per: opts.per, semua: opts.semua, urut: "j.jatuh_tempo, j.pendaftaran_id, j.urutan",
    pilihan: "j.id, j.pendaftaran_id, j.urutan, j.periode, j.jatuh_tempo, j.nominal, j.status_tampil, j.nomor_tagihan, r.nama, r.nomor, r.jumlah_cicilan",
  });
}
