/** Standard page building blocks so every view has the same header, spacing, filter bar and sections. */
import Link from "next/link";
import { SlidersHorizontal, Search } from "lucide-react";
import { IkonHalaman } from "@/components/ikon-halaman";
import { btnBaris, btnSecondary, card } from "@/components/ui";

export function Halaman({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

export function PageHeader({ title, lencana, desc, aksi }: { title: React.ReactNode; lencana?: React.ReactNode; desc?: React.ReactNode; aksi?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 max-w-3xl items-start gap-3">
        <IkonHalaman />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold leading-tight text-[#14232e]">{title}</h1>
            {lencana}
          </div>
          {desc && <p className="mt-0.5 text-[13px] text-[#5b6b78]">{desc}</p>}
        </div>
      </div>
      {aksi && <div className="flex flex-wrap items-center gap-2">{aksi}</div>}
    </header>
  );
}

export function Section({ id, title, desc, aksi, children }: { id?: string; title: string; desc?: React.ReactNode; aksi?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-[#14232e]">{title}</h2>
          {desc && <p className="text-[13px] text-[#5b6b78]">{desc}</p>}
        </div>
        {aksi}
      </div>
      {children}
    </section>
  );
}

export const selectFilter = "h-10 px-3 text-[13px]";

/** Select filter inside a <FilterBar>. `semua` is the label of the empty option. */
export function Pilih({ name, defaultValue, semua, opsi }: { name: string; defaultValue: string; semua: string; opsi: readonly (readonly [string, string])[] }) {
  return (
    <select name={name} defaultValue={defaultValue} aria-label={semua} className={selectFilter}>
      <option value="">{semua}</option>
      {opsi.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/** Search / filter row above a table. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <form className={`${card} flex flex-wrap items-center gap-2 !p-3`}>
      {children}
      <button className={btnSecondary}><SlidersHorizontal size={14} aria-hidden /> Filter</button>
    </form>
  );
}

export function CariInput({ defaultValue, placeholder }: { defaultValue: string; placeholder: string }) {
  return (
    <div className="relative min-w-52 flex-1 sm:max-w-sm">
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a8b98]" />
      <input name="q" defaultValue={defaultValue} placeholder={placeholder} aria-label="Cari" className="h-10 w-full pl-9 pr-3 text-[13px]" />
    </div>
  );
}

/** "Detail" row button: the standard way into a record from a list (the id/name link stays as a shortcut). */
export function TombolDetail({ href }: { href: string }) {
  return <Link href={href} className={btnBaris}>Detail</Link>;
}

/** Titled card for dashboard lists (latest registrations, bills to follow up, activity). `href` adds a "Lihat semua" link. */
export function KartuPanel({ judul, ikon: Ikon, href, children }: { judul: string; ikon?: React.ComponentType<{ size?: number; className?: string }>; href?: string; children: React.ReactNode }) {
  return (
    <section className={`${card} flex flex-col !p-0`}>
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="flex items-center gap-2 font-bold text-[#14232e]">{Ikon && <Ikon size={18} className="text-[var(--primary)]" />}{judul}</h2>
        {href && <Link href={href} className="text-[13px] font-semibold text-[var(--primary)] hover:underline">Lihat semua →</Link>}
      </div>
      <div className="flex-1 px-2 pb-3">{children}</div>
    </section>
  );
}
