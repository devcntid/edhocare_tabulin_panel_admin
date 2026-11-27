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

export type TarifBaris = {
  cara_id: number; cara: string; kelas_id: number; kelas: string;
  /** Effective tariff per faskes id (null = package not available there). */
  tarif: Record<number, number | null>;
  /** True per faskes id when the tariff comes from `harga_paket` (BRD) instead of cara price + kelas price. */
  eksplisit: Record<number, boolean>;
};

/** Every cara x kelas combination with its effective tariff per active faskes and where that tariff comes from (`tarif_paket()`). */
export async function daftarTarifPaket(): Promise<TarifBaris[]> {
  const { rows } = await pool.query(
    `SELECT c.id AS cara_id, c.nama AS cara, k.id AS kelas_id, k.nama AS kelas, f.id AS faskes_id,
            tarif_paket(f.id, c.nama, k.nama) AS tarif,
            EXISTS (SELECT 1 FROM harga_paket hp WHERE hp.faskes_id = f.id AND hp.cara_id = c.id AND hp.kelas_id = k.id) AS eksplisit
     FROM opsi_cara_persalinan c CROSS JOIN opsi_kelas_kamar k CROSS JOIN faskes f
     WHERE f.aktif ORDER BY c.id, k.id, f.id`);
  const out = new Map<string, TarifBaris>();
  for (const r of rows) {
    const key = `${r.cara_id}-${r.kelas_id}`;
    const b: TarifBaris = out.get(key) ?? { cara_id: Number(r.cara_id), cara: r.cara, kelas_id: Number(r.kelas_id), kelas: r.kelas, tarif: {}, eksplisit: {} };
    b.tarif[r.faskes_id] = r.tarif == null ? null : Number(r.tarif);
    b.eksplisit[r.faskes_id] = r.eksplisit;
    out.set(key, b);
  }
  return [...out.values()];
}

/** Set the explicit tariff (`harga_paket`) of one cara x kelas per active faskes, or clear it (`harga = null`) so cara price + kelas price applies again. */
export async function simpanTarifPaket(c: PoolClient, caraId: number, kelasId: number, harga: Record<string, number> | null) {
  const ada = (await c.query("SELECT (SELECT count(*) FROM opsi_cara_persalinan WHERE id = $1) AS c, (SELECT count(*) FROM opsi_kelas_kamar WHERE id = $2) AS k", [caraId, kelasId])).rows[0];
  if (!Number(ada.c) || !Number(ada.k)) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  const faskes = (await c.query("SELECT id FROM faskes WHERE aktif")).rows.map((r) => Number(r.id));
  const lama = (await c.query("SELECT faskes_id, harga FROM harga_paket WHERE cara_id = $1 AND kelas_id = $2 ORDER BY faskes_id", [caraId, kelasId])).rows;
  const fields: Record<string, string> = {};
  if (harga) {
    for (const f of faskes) {
      const v = harga[String(f)];
      if (!Number.isInteger(v) || v <= 0) fields[`harga_${f}`] = "Isi harga lebih dari 0.";
    }
    if (Object.keys(fields).length) throw new ApiError(422, "VALIDASI", "Data tidak valid.", fields);
    for (const f of faskes) {
      await c.query("INSERT INTO harga_paket (faskes_id, cara_id, kelas_id, harga) VALUES ($1,$2,$3,$4) ON CONFLICT (faskes_id, cara_id, kelas_id) DO UPDATE SET harga = EXCLUDED.harga", [f, caraId, kelasId, harga[String(f)]]);
    }
  } else {
    await c.query("DELETE FROM harga_paket WHERE cara_id = $1 AND kelas_id = $2", [caraId, kelasId]);
    for (const f of faskes) {
      const t = (await c.query("SELECT tarif_paket($1, (SELECT nama FROM opsi_cara_persalinan WHERE id = $2), (SELECT nama FROM opsi_kelas_kamar WHERE id = $3)) AS t", [f, caraId, kelasId])).rows[0].t;
      if (t == null) fields[`harga_${f}`] = "Harga cara persalinan dan kelas kamar belum lengkap di faskes ini, jadi tarif tidak bisa dikembalikan.";
    }
    if (Object.keys(fields).length) throw new ApiError(422, "VALIDASI", "Data tidak valid.", fields);
  }
  return { lama };
}
