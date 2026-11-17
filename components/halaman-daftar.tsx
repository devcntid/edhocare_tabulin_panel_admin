/**
 * Standard list page: header + search/filters + one table + pager, driven by a config.
 * Server component; `sel` renderers may return JSX. Money/number columns are rendered with the shared <Uang>/<Angka> cells.
 */
import type { ReactNode } from "react";
import { CariInput, FilterBar, Halaman, PageHeader, Pilih } from "@/components/page";
import { Angka, Pager, Table, Uang } from "@/components/table";

export type Kolom<T> =
  | { judul: string; tipe?: "teks"; sel: (r: T) => ReactNode }
  | { judul: string; tipe: "uang" | "angka"; sel: (r: T) => number | null | undefined };

export type FilterPilih = { name: string; semua: string; opsi: readonly (readonly [string, string])[] };

export function HalamanDaftar<T>({ judul, desc, aksi, cari, filter = [], params, basis, data, kolom, kunci }: {
  judul: string;
  desc?: ReactNode;
  aksi?: ReactNode;
  /** Placeholder of the search box; omit for lists without search. */
  cari?: string;
  filter?: FilterPilih[];
  /** Current values of `q` and every filter name (from the URL). */
  params: Record<string, string>;
  /** Page path, e.g. "/tagihan". */
  basis: string;
  data: { rows: T[]; total: number; page: number; pages: number };
  kolom: Kolom<T>[];
  kunci: (r: T) => string | number;
}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return (
    <Halaman>
      <PageHeader title={judul} desc={desc} aksi={aksi} />
      {(cari || filter.length > 0) && (
        <FilterBar>
          {cari && <CariInput defaultValue={params.q ?? ""} placeholder={cari} />}
          {filter.map((f) => <Pilih key={f.name} name={f.name} defaultValue={params[f.name] ?? ""} semua={f.semua} opsi={f.opsi} />)}
        </FilterBar>
      )}
      <div>
        <Table head={kolom.map((k) => k.judul)} empty={!data.rows.length} filtered={!!query} resetHref={basis}>
          {data.rows.map((r) => (
            <tr key={kunci(r)}>
              {kolom.map((k) =>
                k.tipe === "uang" ? <Uang key={k.judul} v={k.sel(r)} />
                : k.tipe === "angka" ? <Angka key={k.judul} v={k.sel(r)} />
                : <td key={k.judul}>{k.sel(r)}</td>)}
            </tr>
          ))}
        </Table>
        <Pager base={query ? `${basis}?${query}` : basis} page={data.page} pages={data.pages} total={data.total} />
      </div>
    </Halaman>
  );
}
