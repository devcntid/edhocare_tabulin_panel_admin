import Link from "next/link";
import { PerHalaman } from "@/components/per-halaman";
import { fmtAngka } from "@/lib/format";

/** Standard data table. Column headers are left-aligned; numeric cells use <Angka>/<Uang> (right-aligned). */
export function Table({ head, children, empty, filtered, resetHref, bawah, polos }: { head: string[]; children: React.ReactNode; empty?: boolean; filtered?: boolean; resetHref?: string; /** Pager (or footer) shown inside the same card, under the rows. */ bawah?: React.ReactNode; /** No card around the table: for tables inside another card. */ polos?: boolean }) {
  return (
    <div className={polos ? "" : "overflow-hidden rounded-2xl border border-[#e1eaf2] bg-white shadow-[0_1px_3px_rgba(16,64,96,0.06)]"}>
      <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead className={`text-[11px] uppercase tracking-wide text-[#5b6b78] ${polos ? "border-b border-[#e8eef4]" : "bg-[#f3f7fb]"}`}>
          <tr>{head.map((h, i) => <th key={`${h}-${i}`} className="whitespace-nowrap px-4 py-3 font-bold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#edf1f5] [&_td]:px-4 [&_td]:py-3 [&_tr:hover]:bg-[#f8fbfd]">
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className="py-8 text-center text-[#888]">
                {filtered ? (
                  <>Tidak ada hasil untuk pencarian atau filter ini.{resetHref && <> <Link href={resetHref} className="font-semibold text-[var(--primary)]">Reset filter</Link></>}</>
                ) : "Belum ada data."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {bawah && <div className="border-t border-[#e8eef4] px-4 py-3 [&>div]:!mt-0">{bawah}</div>}
    </div>
  );
}

/** Numeric cell (counts, quantities): fixed narrow column, right-aligned with tabular digits. */
export function Angka({ v }: { v: number | null | undefined }) {
  return <td className="w-24 whitespace-nowrap text-right tabular-nums">{v == null ? "-" : fmtAngka(v)}</td>;
}

/** Money cell: fixed width, "Rp" pinned to the left of the cell and the amount right-aligned. Negative amounts are red. */
export function Uang({ v }: { v: number | null | undefined }) {
  return (
    <td className={`min-w-[7.5rem] whitespace-nowrap tabular-nums ${v != null && v < 0 ? "text-red-600" : ""}`}>
      {v == null ? <span className="block text-right text-[#888]">-</span> : <span className="flex justify-between"><span>Rp</span><span>{fmtAngka(v)}</span></span>}
    </td>
  );
}

/** Page numbers to show: first, last, the current page and one neighbour each side, with null marking a gap ("…"). */
export function nomorHalaman(page: number, pages: number): (number | null)[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const urut = [...set].sort((x, y) => x - y);
  const out: (number | null)[] = [];
  urut.forEach((n, i) => {
    if (i > 0 && n - urut[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/** Query keys of one pager. Several pagers on one page (detail sections) each get their own prefix, e.g. "bb_page" and "bb_per". */
export const kunciPage = (awalan?: string) => (awalan ? `${awalan}_page` : "page");
export const kunciPer = (awalan?: string) => (awalan ? `${awalan}_per` : "per");
export const kunciSendiri = (k: string, awalan?: string) => k === kunciPage(awalan) || k === kunciPer(awalan);

const tombolHal = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-[13px] font-semibold";

/**
 * Standard pagination: range summary, rows-per-page, first / previous / numbered pages / next / last.
 * `params` are the current search and filters (kept in every link); the page and per-page choice go in `page` and `per`.
 */
export function Pager({ basis, params, page, pages, total, per, awalan, jangkar }: { basis: string; params: Record<string, string>; page: number; pages: number; total: number; per: number; awalan?: string; jangkar?: string }) {
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && !kunciSendiri(k, awalan)));
    q.set(kunciPer(awalan), String(per));
    if (p > 1) q.set(kunciPage(awalan), String(p));
    return `${basis}?${q}${jangkar ? `#${jangkar}` : ""}`;
  };
  const dari = total === 0 ? 0 : (page - 1) * per + 1;
  const sampai = Math.min(total, page * per);
  const aktif = `${tombolHal} border-[#cfdde8] bg-white text-[#24323d] hover:bg-[#eef6fb]`;
  const mati = `${tombolHal} cursor-not-allowed border-[#eee] bg-[#fafafa] text-[#bbb]`;
  const nav = (label: string, aria: string, tujuan: number, nonaktif: boolean) =>
    nonaktif ? <span aria-disabled="true" aria-label={aria} className={mati}>{label}</span> : <Link aria-label={aria} className={aktif} href={href(tujuan)}>{label}</Link>;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#666]">
      <div className="flex flex-wrap items-center gap-3">
        <span>Menampilkan <b className="text-[#333]">{dari}–{sampai}</b> dari <b className="text-[#333]">{total}</b> data</span>
        <PerHalaman basis={basis} params={params} per={per} awalan={awalan} jangkar={jangkar} />
      </div>
      {pages > 1 && (
        <nav aria-label="Navigasi halaman" className="flex flex-wrap items-center gap-1.5">
          {nav("«", "Halaman pertama", 1, page <= 1)}
          {nav("‹", "Halaman sebelumnya", page - 1, page <= 1)}
          {nomorHalaman(page, pages).map((n, i) =>
            n === null ? <span key={`g${i}`} aria-hidden className="px-1">…</span>
            : n === page ? <span key={n} aria-current="page" className={`${tombolHal} border-[var(--primary)] bg-[var(--primary)] text-white`}>{n}</span>
            : <Link key={n} aria-label={`Halaman ${n}`} className={aktif} href={href(n)}>{n}</Link>)}
          {nav("›", "Halaman berikutnya", page + 1, page >= pages)}
          {nav("»", "Halaman terakhir", pages, page >= pages)}
        </nav>
      )}
    </div>
  );
}

export const pageNum = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : 1;
};
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** Rows-per-page from the URL as a number; the service falls back to the default for values outside the allowed choices. */
export const perNum = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) ? n : undefined;
};
