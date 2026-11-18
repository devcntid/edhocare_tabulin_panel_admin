/** Standard number cards. Money: "Rp" pinned left, amount right-aligned. Counts: right-aligned. Shared by dashboard and detail pages. */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
      <div className="text-[13px] text-[#5b6b78]">{label}</div>
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

type Ikon = React.ComponentType<{ size?: number; className?: string }>;
const NADA = {
  amber: { kartu: "from-[#fff4e0] to-white border-[#f6dfb5]", ikon: "bg-[#ffe7bd] text-[#b4640a]", chip: "bg-[#ffe7bd] text-[#8a4b05]" },
  sky: { kartu: "from-[#e6f4fc] to-white border-[#c5e3f4]", ikon: "bg-[#cfe9f7] text-[#1a6a94]", chip: "bg-[#cfe9f7] text-[#0f5276]" },
  rose: { kartu: "from-[#fdecec] to-white border-[#f5cfcf]", ikon: "bg-[#fbd5d5] text-[#b42323]", chip: "bg-[#fbd5d5] text-[#8f1b1b]" },
  violet: { kartu: "from-[#efeafa] to-white border-[#d9cff0]", ikon: "bg-[#e1d7f5] text-[#5b378b]", chip: "bg-[#e1d7f5] text-[#47296d]" },
  green: { kartu: "from-[#e8f7ef] to-white border-[#c6e9d5]", ikon: "bg-[#cdeedb] text-[#157a47]", chip: "bg-[#cdeedb] text-[#0f5f37]" },
} as const;
export type Nada = keyof typeof NADA;

/** Action card for the dashboard "to do" row: icon, label, count and a status chip. `href` makes the whole card a link. */
export function KartuTugas({ label, v, chip, nada, ikon: Ikon, href }: { label: string; v: number; chip: string; nada: Nada; ikon: Ikon; href?: string }) {
  const n = NADA[nada];
  const isi = (
    <div className={`flex h-full items-center gap-4 rounded-2xl border bg-gradient-to-br p-4 shadow-[0_1px_3px_rgba(16,64,96,0.06)] ${n.kartu}`}>
      <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${n.ikon}`}><Ikon size={24} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-[#24323d]">{label}</div>
        <div className="text-3xl font-bold leading-tight tabular-nums text-[#14232e]">{fmtAngka(v)}</div>
        <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-bold ${n.chip}`}>{chip}</span>
      </div>
      {href && <ChevronRight aria-hidden size={18} className="shrink-0 text-[#5b6b78]" />}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{isi}</Link> : isi;
}

/** Summary card for the dashboard money/people row: round icon, label, big value and a small note. */
export function KartuRingkas({ label, v, uang, catatan, ikon: Ikon, href }: { label: string; v: number; uang?: boolean; catatan: string; ikon: Ikon; href?: string }) {
  const isi = (
    <div className={`${card} flex h-full items-center gap-4`}>
      <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e3f1f9] text-[var(--primary)]"><Ikon size={22} /></span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#24323d]">{label}</div>
        <div className="text-2xl font-bold leading-tight tabular-nums text-[#14232e]">{uang ? `Rp ${fmtAngka(v)}` : fmtAngka(v)}</div>
        <div className="text-xs text-[#5b6b78]">{catatan}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{isi}</Link> : isi;
}
