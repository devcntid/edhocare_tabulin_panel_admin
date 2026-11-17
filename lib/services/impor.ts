/** CSV import of registrations (manual registration in bulk). Reuses the rules of the single form (`siapkan`/`sisip`); the file is all-or-nothing. */
import { ApiError } from "@/lib/api";
import { bacaCsv, buatCsv } from "@/lib/csv";
import { pool } from "@/lib/db";
import { buatSchema, siapkan, sisip, type Siap } from "@/lib/services/pendaftaran";

export const IMPOR_MAKS_BARIS = 500;
export const IMPOR_MAKS_BYTE = 1_000_000;
export const KOLOM_IMPOR = ["no_rm", "kode_faskes", "cara_persalinan", "kelas_kamar", "jumlah_cicilan", "hpht"] as const;

export type GalatBaris = { baris: number; no_rm: string; pesan: string };
export type HasilImpor = { periksa: boolean; jumlah: number; valid: number; dibuat: number; galat: GalatBaris[] };

/** Example file for the download button: header plus one real-looking row. */
export const templatImpor = () => buatCsv([...KOLOM_IMPOR], [["RM-0001", "BDG", "Partus Normal", "Kelas 1", 6, "2026-09-01"]]);

/** Excel often rewrites dates as 1/9/2026 or 01-09-2026; accept those as DD/MM/YYYY and always return a real YYYY-MM-DD, or null. */
export function normalHpht(v: string): string | null {
  const t = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t) ?? ((x) => (x ? [x[0], x[3], x[2].padStart(2, "0"), x[1].padStart(2, "0")] : null))(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const pesanGalat = (e: unknown) => {
  if (e instanceof ApiError) return e.fields ? Object.values(e.fields).join(" ") : e.message;
  throw e;
};

export async function imporPendaftaran(teks: string, o: { adminId: number; periksa: boolean }): Promise<HasilImpor> {
  let tabel: string[][];
  try { tabel = bacaCsv(teks); } catch (e) { throw new ApiError(422, "FILE_TIDAK_VALID", (e as Error).message); }
  if (!tabel.length) throw new ApiError(422, "FILE_TIDAK_VALID", "File kosong.");
  const kepala = tabel[0].map((h) => h.trim().toLowerCase());
  const hilang = KOLOM_IMPOR.filter((k) => !kepala.includes(k));
  if (hilang.length) throw new ApiError(422, "FILE_TIDAK_VALID", `Kolom tidak ada: ${hilang.join(", ")}. Gunakan templat.`);
  const data = tabel.slice(1);
  if (!data.length) throw new ApiError(422, "FILE_TIDAK_VALID", "File tidak berisi baris data.");
  if (data.length > IMPOR_MAKS_BARIS) throw new ApiError(422, "FILE_TIDAK_VALID", `Maksimal ${IMPOR_MAKS_BARIS} baris per file.`);

  const [faskes, cara, kelas, berjalan] = await Promise.all([
    pool.query("SELECT id, kode FROM faskes WHERE aktif"),
    pool.query("SELECT nama FROM opsi_cara_persalinan WHERE aktif"),
    pool.query("SELECT nama FROM opsi_kelas_kamar WHERE aktif"),
    pool.query("SELECT no_rm FROM pendaftaran WHERE status_pendaftaran NOT IN ('ditolak','kedaluwarsa')"),
  ]);
  const idFaskes = new Map<string, number>(faskes.rows.map((r) => [String(r.kode).toLowerCase(), Number(r.id)]));
  const namaCara = new Map<string, string>(cara.rows.map((r) => [String(r.nama).toLowerCase(), r.nama]));
  const namaKelas = new Map<string, string>(kelas.rows.map((r) => [String(r.nama).toLowerCase(), r.nama]));
  const sudah = new Set<string>(berjalan.rows.map((r) => r.no_rm));
  const dalamFile = new Set<string>();

  const galat: GalatBaris[] = [];
  const siap: { baris: number; s: Siap }[] = [];
  for (let i = 0; i < data.length; i++) {
    const baris = i + 2; // spreadsheet row number: header is row 1
    const sel = (k: string) => (data[i][kepala.indexOf(k)] ?? "").trim();
    const noRm = sel("no_rm");
    const gagal = (pesan: string) => galat.push({ baris, no_rm: noRm, pesan });
    const hpht = normalHpht(sel("hpht"));
    if (!hpht) { gagal("HPHT harus tanggal yang valid (YYYY-MM-DD)."); continue; }
    const fid = idFaskes.get(sel("kode_faskes").toLowerCase());
    if (!fid) { gagal(`Kode faskes "${sel("kode_faskes")}" tidak dikenal.`); continue; }
    const c = namaCara.get(sel("cara_persalinan").toLowerCase());
    if (!c) { gagal(`Cara persalinan "${sel("cara_persalinan")}" tidak tersedia.`); continue; }
    const k = namaKelas.get(sel("kelas_kamar").toLowerCase());
    if (!k) { gagal(`Kelas kamar "${sel("kelas_kamar")}" tidak tersedia.`); continue; }
    const p = buatSchema.safeParse({ no_rm: noRm, faskes_id: fid, cara_persalinan: c, kelas_kamar: k, jumlah_cicilan: sel("jumlah_cicilan"), hpht });
    if (!p.success) { gagal(p.error.issues.map((x) => x.message).join(" ")); continue; }
    if (dalamFile.has(noRm)) { gagal("No. RM muncul lebih dari sekali di file ini."); continue; }
    dalamFile.add(noRm);
    if (sudah.has(noRm)) { gagal("No. RM ini sudah memiliki pendaftaran yang berjalan."); continue; }
    try { siap.push({ baris, s: await siapkan(p.data) }); } catch (e) { gagal(pesanGalat(e)); }
  }
  const hasil: HasilImpor = { periksa: o.periksa, jumlah: data.length, valid: siap.length, dibuat: 0, galat };
  if (o.periksa || galat.length) return hasil;

  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const { baris, s } of siap) {
      try { await sisip(c, s, o.adminId); } catch (e) {
        await c.query("ROLLBACK");
        return { ...hasil, galat: [{ baris, no_rm: s.input.no_rm, pesan: pesanGalat(e) }] };
      }
    }
    await c.query("SELECT catat_audit($1,'impor','pendaftaran',NULL,NULL,$2)", [o.adminId, JSON.stringify({ baris: siap.length })]);
    await c.query("COMMIT");
    return { ...hasil, dibuat: siap.length };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
