import type { PoolClient } from "pg";
import { ApiError } from "@/lib/api";
import { pool } from "@/lib/db";

const JENIS = {
  cara: { tabel: "opsi_cara_persalinan", tier: false, hargaTabel: "harga_cara", hargaKolom: "cara_id" },
  kelas: { tabel: "opsi_kelas_kamar", tier: true, hargaTabel: "harga_kelas", hargaKolom: "kelas_id" },
} as const;

export function masterDef(jenis: string) {
  const d = JENIS[jenis as keyof typeof JENIS];
  if (!d) throw new ApiError(404, "TIDAK_DITEMUKAN", "Jenis data tidak dikenal.");
  return d;
}

export type Faskes = { id: number; kode: string; nama: string };
/** Price per faskes, keyed by faskes id. */
export type Harga = Record<number, number>;
export type Cara = { id: number; nama: string; aktif: boolean; dipakai: number; harga: Harga };
export type Kelas = { id: number; nama: string; tier: string; setoran_min_bulanan: number; aktif: boolean; dipakai: number; harga: Harga };

const hargaPer = (rows: { faskes_id: number; ref: number; harga: number }[]) => {
  const out = new Map<number, Harga>();
  for (const r of rows) out.set(r.ref, { ...(out.get(r.ref) ?? {}), [r.faskes_id]: Number(r.harga) });
  return out;
};

export async function daftarMaster() {
  const [faskes, cara, kelas, hc, hk] = await Promise.all([
    pool.query("SELECT id, kode, nama FROM faskes WHERE aktif ORDER BY id"),
    pool.query("SELECT o.id, o.nama, o.aktif, (SELECT count(*)::int FROM pendaftaran d JOIN paket p ON p.id = d.paket_id WHERE p.cara_persalinan = o.nama) AS dipakai FROM opsi_cara_persalinan o ORDER BY o.nama"),
    pool.query("SELECT o.id, o.nama, o.tier, o.setoran_min_bulanan, o.aktif, (SELECT count(*)::int FROM pendaftaran d JOIN paket p ON p.id = d.paket_id WHERE p.kelas_kamar = o.nama) AS dipakai FROM opsi_kelas_kamar o ORDER BY o.nama"),
    pool.query("SELECT faskes_id, cara_id AS ref, harga FROM harga_cara"),
    pool.query("SELECT faskes_id, kelas_id AS ref, harga FROM harga_kelas"),
  ]);
  const pc = hargaPer(hc.rows), pk = hargaPer(hk.rows);
  return {
    faskes: faskes.rows as Faskes[],
    cara: cara.rows.map((r) => ({ ...r, harga: pc.get(r.id) ?? {} })) as Cara[],
    kelas: kelas.rows.map((r) => ({ ...r, harga: pk.get(r.id) ?? {} })) as Kelas[],
  };
}

/** Validate a {faskes_id: harga} map against the active faskes and replace the stored prices. */
export async function simpanHarga(c: PoolClient, jenis: "cara" | "kelas", id: number, harga: Record<string, number>) {
  const d = masterDef(jenis);
  const faskes = (await c.query("SELECT id FROM faskes WHERE aktif")).rows.map((r) => Number(r.id));
  const fields: Record<string, string> = {};
  for (const f of faskes) {
    const v = harga[String(f)];
    if (!Number.isInteger(v) || v <= 0) fields[`harga_${f}`] = "Isi harga lebih dari 0.";
  }
  if (Object.keys(fields).length) throw new ApiError(422, "VALIDASI", "Data tidak valid.", fields);
  for (const f of faskes) {
    await c.query(`INSERT INTO ${d.hargaTabel} (faskes_id, ${d.hargaKolom}, harga) VALUES ($1,$2,$3) ON CONFLICT (faskes_id, ${d.hargaKolom}) DO UPDATE SET harga = EXCLUDED.harga`, [f, id, harga[String(f)]]);
  }
}

/** Resolve (and create on first use) the paket row for a cara x kelas combination. */
export async function paketUntuk(cara: string, kelas: string) {
  await pool.query(
    `INSERT INTO paket (kelas_kamar, cara_persalinan, setoran_min_bulanan, tier)
     SELECT k.nama, $1, k.setoran_min_bulanan, k.tier FROM opsi_kelas_kamar k WHERE k.nama = $2
     ON CONFLICT (kelas_kamar, cara_persalinan) DO NOTHING`, [cara, kelas]);
  return (await pool.query("SELECT id, setoran_min_bulanan, tier FROM paket WHERE cara_persalinan = $1 AND kelas_kamar = $2", [cara, kelas])).rows[0] as { id: number; setoran_min_bulanan: number; tier: string } | undefined;
}

export async function tarifPaket(faskesId: number, cara: string, kelas: string) {
  const t = (await pool.query("SELECT tarif_paket($1,$2,$3) AS t", [faskesId, cara, kelas])).rows[0].t;
  return t == null ? null : Number(t);
}
