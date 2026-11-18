/**
 * Standard list page: header + search/filters + one table + pager, driven by a config.
 * Server component; `sel` renderers may return JSX. Money/number columns are rendered with the shared <Uang>/<Angka> cells.
 */
import type { ReactNode } from "react";
import { CariInput, FilterBar, Halaman, PageHeader, Pilih } from "@/components/page";
import { Angka, Pager, Table, Uang } from "@/components/table";
import { btnSecondary } from "@/components/ui";

export type Kolom<T> =
  | { judul: string; tipe?: "teks"; sel: (r: T) => ReactNode }
  | { judul: string; tipe: "uang" | "angka"; sel: (r: T) => number | null | undefined }
  /** Row buttons (Detail, shortcuts): right-aligned in a fixed-width cell that wraps onto a second line, so the table never grows wider than the screen. */
  | { judul: string; tipe: "aksi"; sel: (r: T) => ReactNode };

export type FilterPilih = { name: string; semua: string; opsi: readonly (readonly [string, string])[] };

export function HalamanDaftar<T>({ judul, desc, aksi, ekspor, cari, filter = [], params, basis, data, kolom, kunci }: {
  judul: string;
  desc?: ReactNode;
  aksi?: ReactNode;
  /** Export dataset key (lib/services/ekspor.ts): adds CSV and PDF buttons that carry the current search and filter. Omit when the user may not export. */
  ekspor?: string;
  /** Placeholder of the search box; omit for lists without search. */
  cari?: string;
  filter?: FilterPilih[];
  /** Current values of `q` and every filter name (from the URL). */
  params: Record<string, string>;
  /** Page path, e.g. "/tagihan". */
  basis: string;
  data: { rows: T[]; total: number; page: number; per: number; pages: number };
  kolom: Kolom<T>[];
  kunci: (r: T) => string | number;
}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return (
    <Halaman>
      <PageHeader title={judul} desc={desc} aksi={(ekspor || aksi) && <>{ekspor && <TombolEkspor dataset={ekspor} params={params} />}{aksi}</>} />
      {(cari || filter.length > 0) && (
        <FilterBar>
          {cari && <CariInput defaultValue={params.q ?? ""} placeholder={cari} />}
          {filter.map((f) => <Pilih key={f.name} name={f.name} defaultValue={params[f.name] ?? ""} semua={f.semua} opsi={f.opsi} />)}
        </FilterBar>
      )}
      <div>
        <Table head={kolom.map((k) => k.judul)} empty={!data.rows.length} filtered={!!query} resetHref={basis}
          bawah={<Pager basis={basis} params={params} page={data.page} pages={data.pages} total={data.total} per={data.per} />}>
          {data.rows.map((r) => (
            <tr key={kunci(r)}>
              {kolom.map((k) =>
                k.tipe === "uang" ? <Uang key={k.judul} v={k.sel(r)} />
                : k.tipe === "angka" ? <Angka key={k.judul} v={k.sel(r)} />
                : k.tipe === "aksi" ? <td key={k.judul} className="w-px"><div className="flex w-56 flex-wrap items-center justify-end gap-2">{k.sel(r)}</div></td>
                : <td key={k.judul}>{k.sel(r)}</td>)}
            </tr>
          ))}
        </Table>
      </div>
    </Halaman>
  );
}

/** CSV / PDF download links for the list on screen (search and filters are passed on to the export). */
function TombolEkspor({ dataset, params }: { dataset: string; params: Record<string, string> }) {
  const href = (format: string) => `/api/ekspor/${dataset}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), format })}`;
  return (
    <>
      <a href={href("csv")} className={btnSecondary} download>Ekspor CSV</a>
      <a href={href("pdf")} className={btnSecondary} download>Ekspor PDF</a>
    </>
  );
}
