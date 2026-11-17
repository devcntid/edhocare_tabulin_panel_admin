"use client";
import { useState } from "react";
import { AksiBaris, btnBaris, Field, FormDialog, StatusAktif } from "@/components/form-dialog";
import { HapusButton } from "@/components/hapus-button";
import { Angka } from "@/components/table";
import { input, TAMPIL } from "@/components/ui";
import { useApi } from "@/components/use-api";

export type F = { id: number; kode: string; nama: string; alamat: string | null; no_telepon: string | null; email: string | null; aktif: boolean; dipakai: number };

const galatTeks = (api: { error: string | null; fields: Record<string, string> }) => (api.error ? `${api.error} ${Object.values(api.fields).join(" ")}` : null);

type V = { nama: string; alamat: string; no_telepon: string; email: string };
function Isian({ v, setV }: { v: V; setV: (x: V) => void }) {
  return (
    <>
      <Field label="Nama faskes"><input className={input} required value={v.nama} onChange={(e) => setV({ ...v, nama: e.target.value })} /></Field>
      <Field label="Alamat (opsional)"><input className={input} value={v.alamat} onChange={(e) => setV({ ...v, alamat: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="No. telepon (opsional)"><input className={input} inputMode="tel" value={v.no_telepon} onChange={(e) => setV({ ...v, no_telepon: e.target.value })} /></Field>
        <Field label="Email (opsional)"><input className={input} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
      </div>
    </>
  );
}

export function FaskesBaris({ f, bisa }: { f: F; bisa: boolean }) {
  const api = useApi();
  const awal = { nama: f.nama, alamat: f.alamat ?? "", no_telepon: f.no_telepon ?? "", email: f.email ?? "" };
  const [v, setV] = useState(awal);
  return (
    <tr className={f.aktif ? "" : "text-[#999]"}>
      <td className="font-mono text-xs">{f.kode}</td><td className="font-semibold">{f.nama}</td><td>{f.alamat ?? "-"}</td><td>{f.no_telepon ?? "-"}</td><td>{f.email ?? "-"}</td>
      <Angka v={f.dipakai} />
      <td><StatusAktif aktif={f.aktif} kata={TAMPIL} /></td>
      {bisa && (
        <AksiBaris>
          <FormDialog gaya="baris" tombol="Ubah" judul={`Ubah ${f.nama}`} desc={`Kode ${f.kode} tidak dapat diubah.`} busy={api.busy} galat={galatTeks(api)} onBatal={() => setV(awal)}
            onSubmit={() => api.call(`/api/faskes/${f.id}`, v, "PATCH")}>
            <Isian v={v} setV={setV} />
          </FormDialog>
          <button className={btnBaris} disabled={api.busy} onClick={() => api.call(`/api/faskes/${f.id}`, { aktif: !f.aktif }, "PATCH")}>{f.aktif ? "Sembunyikan" : "Tampilkan"}</button>
          <HapusButton entitas="faskes" refId={f.id} nama={f.nama} dipakai={f.dipakai} />
          {api.error && <span role="alert" className="text-xs text-red-600">{api.error}</span>}
        </AksiBaris>
      )}
    </tr>
  );
}

export function FaskesBaru() {
  const api = useApi();
  const kosong = { kode: "", nama: "", alamat: "", no_telepon: "", email: "" };
  const [v, setV] = useState(kosong);
  return (
    <FormDialog tombol="+ Tambah faskes" judul="Tambah faskes" desc="Setelah ditambah, isi harga cara persalinan dan kelas kamar untuk faskes ini." busy={api.busy} galat={galatTeks(api)} onBatal={() => setV(kosong)}
      onSubmit={async () => {
        const ok = await api.call("/api/faskes", v);
        if (ok) setV(kosong);
        return ok;
      }}>
      <Field label="Kode" hint="2-6 huruf atau angka, tidak dapat diubah. Mis. BDG."><input className={input} required value={v.kode} onChange={(e) => setV({ ...v, kode: e.target.value })} /></Field>
      <Isian v={v} setV={(x) => setV({ ...v, ...x })} />
    </FormDialog>
  );
}
