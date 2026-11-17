import Link from "next/link";
import { fmtAngka } from "@/lib/format";

/** Standard data table. Column headers are left-aligned; numeric cells use <Angka>/<Uang> (right-aligned). */
export function Table({ head, children, empty, filtered, resetHref }: { head: string[]; children: React.ReactNode; empty?: boolean; filtered?: boolean; resetHref?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e5e7eb] bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f8fafb] text-xs uppercase tracking-wide text-[#666]">
          <tr>{head.map((h, i) => <th key={`${h}-${i}`} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#eee] [&_td]:px-4 [&_td]:py-3">
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

export function Pager({ base, page, pages, total }: { base: string; page: number; pages: number; total: number }) {
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  return (
    <div className="mt-3 flex items-center justify-between text-[13px] text-[#666]">
      <span>{total} data · halaman {page} dari {pages}</span>
      <span className="flex gap-2">
        {page > 1 && <Link className="rounded-lg border border-[#ddd] bg-white px-3 py-1.5" href={href(page - 1)}>Sebelumnya</Link>}
        {page < pages && <Link className="rounded-lg border border-[#ddd] bg-white px-3 py-1.5" href={href(page + 1)}>Berikutnya</Link>}
      </span>
    </div>
  );
}

export const pageNum = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : 1;
};
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
