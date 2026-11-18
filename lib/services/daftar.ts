/** Shared building blocks for server-side list queries (search + filter + pagination). New list endpoints should use these instead of re-writing them. */
import { pool } from "@/lib/db";
import { EKSPOR_MAKS, perValid } from "@/lib/services/pendaftaran";

/** `semua` (exports) ignores the page and returns up to EKSPOR_MAKS rows from the start. */
export function paging(page: number | undefined, semua = false, per?: number) {
  const n = perValid(per);
  if (semua) return { p: 1, per: n, limit: EKSPOR_MAKS, offset: 0 };
  const p = Math.max(1, page ?? 1);
  return { p, per: n, limit: n, offset: (p - 1) * n };
}
export const pages = (total: number, per?: number) => Math.max(1, Math.ceil(total / perValid(per)));

/** ILIKE search over several columns. Pushes its parameter onto `args`; null when the search is empty. */
export function cari(args: unknown[], q: string | undefined, kolom: string[]): string | null {
  if (!q?.trim()) return null;
  args.push(`%${q.trim().replace(/[\\%_]/g, "\\$&")}%`);
  return "(" + kolom.map((c) => `${c} ILIKE $${args.length}`).join(" OR ") + ")";
}

/** Equality filter restricted to an allowlist (never interpolate user input). Null when empty or not allowed. */
export function pilih(args: unknown[], nilai: string | undefined, boleh: readonly string[], kolom: string): string | null {
  if (!nilai || !boleh.includes(nilai)) return null;
  args.push(nilai);
  return `${kolom} = $${args.length}`;
}

export const klausa = (kond: (string | null)[]) => {
  const k = kond.filter(Boolean);
  return k.length ? "WHERE " + k.join(" AND ") : "";
};

/** Allowed values of the standard filters (also used to build the filter dropdowns). */
export const FILTER = {
  statusTagihan: ["belum_dibayar", "lewat_jatuh_tempo", "lunas"],
  jenisTransaksi: ["DP", "Setoran bulanan", "Setoran bulanan + tambahan", "Setoran tambahan", "Koreksi"],
  kategoriNotifikasi: ["pendaftaran", "tagihan", "pembayaran", "milestone"],
  hasilApi: ["diterima", "duplikat", "ditolak"],
  statusJadwal: ["belum_terbit", "belum_dibayar", "lewat_jatuh_tempo", "lunas"],
} as const;

/** One page of an already-loaded (small, filtered in memory) list, in the same shape as ambilHalaman. A page past the end shows the last one. */
export function potong<T>(semua: T[], page?: number, per?: number): Halaman<T> {
  const n = perValid(per);
  const jumlah = pages(semua.length, n);
  const p = Math.min(Math.max(1, page ?? 1), jumlah);
  return { rows: semua.slice((p - 1) * n, p * n), total: semua.length, page: p, per: n, pages: jumlah };
}

export type Halaman<T> = { rows: T[]; total: number; page: number; per: number; pages: number };

/**
 * One page of a list. `dari` is everything after FROM (joins and the WHERE built with `klausa`),
 * `args` the parameters collected by `cari`/`pilih`, `pilihan` the SELECT list, `urut` the ORDER BY.
 */
export async function ambilHalaman<T>(o: { dari: string; args: unknown[]; pilihan: string; urut: string; page?: number; per?: number; semua?: boolean }): Promise<Halaman<T>> {
  const { p, per, limit, offset } = paging(o.page, o.semua, o.per);
  const total = (await pool.query(`SELECT count(*)::int AS n FROM ${o.dari}`, o.args)).rows[0].n as number;
  const { rows } = await pool.query(`SELECT ${o.pilihan} FROM ${o.dari} ORDER BY ${o.urut} LIMIT ${limit} OFFSET ${offset}`, o.args);
  return { rows: rows as T[], total, page: p, per, pages: pages(total, per) };
}
