/** Standard page building blocks so every view has the same header, spacing, filter bar and sections. */
import { btnSecondary, input } from "@/components/ui";

export function Halaman({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

export function PageHeader({ title, lencana, desc, aksi }: { title: React.ReactNode; lencana?: React.ReactNode; desc?: React.ReactNode; aksi?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">{title}</h1>
          {lencana}
        </div>
        {desc && <p className="mt-1 text-[13px] text-[#666]">{desc}</p>}
      </div>
      {aksi && <div className="flex flex-wrap items-center gap-2">{aksi}</div>}
    </header>
  );
}

export function Section({ title, desc, aksi, children }: { title: string; desc?: React.ReactNode; aksi?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-bold">{title}</h2>
          {desc && <p className="text-[13px] text-[#666]">{desc}</p>}
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
    <form className="flex flex-wrap items-center gap-2">
      {children}
      <button className={btnSecondary}>Terapkan</button>
    </form>
  );
}

export function CariInput({ defaultValue, placeholder }: { defaultValue: string; placeholder: string }) {
  return <input name="q" defaultValue={defaultValue} placeholder={placeholder} aria-label="Cari" className={`${input} max-w-xs`} />;
}
