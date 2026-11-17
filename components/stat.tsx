/** Standard number cards. Money: "Rp" pinned left, amount right-aligned. Counts: right-aligned. Shared by dashboard and detail pages. */
import Link from "next/link";
import { card } from "@/components/ui";
import { fmtAngka } from "@/lib/format";

type Nilai = { v?: number | null; uang?: boolean; children?: React.ReactNode };

function Baris({ v, uang, children, besar }: Nilai & { besar?: boolean }) {
  if (children != null) return <div className={besar ? "mt-1 text-2xl font-bold" : "mt-0.5 font-semibold"}>{children}</div>;
  return (
    <div className={`flex items-baseline justify-between gap-2 tabular-nums ${besar ? "mt-1 text-2xl font-bold" : "mt-0.5 font-semibold"}`}>
      {uang ? <span className={besar ? "text-sm font-semibold text-[#666]" : "text-xs font-normal text-[#666]"}>Rp</span> : <span />}
      <span>{v == null ? "-" : fmtAngka(v)}</span>
    </div>
  );
}

/** Large card for dashboards and bill summaries. */
export function Stat({ label, href, ...n }: { label: string; href?: string } & Nilai) {
  const isi = (
    <div className={`${card} h-full`}>
      <div className="text-xs text-[#666]">{label}</div>
      <Baris {...n} besar />
    </div>
  );
  return href ? <Link href={href}>{isi}</Link> : isi;
}

/** Small label/value pair inside an info card (detail pages). */
export function Info({ label, ...n }: { label: string } & Nilai) {
  return (
    <div>
      <dt className="text-xs text-[#666]">{label}</dt>
      <dd><Baris {...n} /></dd>
    </div>
  );
}

/** Info card: a grid of <Info>. */
export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <section className={`${card} grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4`}><dl className="contents">{children}</dl></section>;
}

/** Row of large <Stat> cards. `kolom` should divide the number of cards so no row is left ragged. */
export function StatGrid({ children, kolom = 4 }: { children: React.ReactNode; kolom?: 3 | 4 }) {
  return <div className={`grid grid-cols-2 gap-3 ${kolom === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>{children}</div>;
}
