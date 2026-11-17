"use client";
import { useState } from "react";
import { AksiBaris, btnBaris, Field, FormDialog, StatusAktif } from "@/components/form-dialog";
import { HapusButton } from "@/components/hapus-button";
import { input, TAMPIL } from "@/components/ui";
import { useApi } from "@/components/use-api";

type T = { kode: string; nama: string; kategori: string; kategoriLabel: string; dipakai: number; judul: string; isi: string; variabel: string[]; aktif: boolean };

export function TemplatBaris({ t, bisa, kategori }: { t: T; bisa: boolean; kategori: readonly (readonly [string, string])[] }) {
  const api = useApi();
  const [nama, setNama] = useState(t.nama);
  const [kat, setKat] = useState(t.kategori);
  const [judul, setJudul] = useState(t.judul);
  const [isi, setIsi] = useState(t.isi);
  const galat = api.error ? `${api.error} ${Object.values(api.fields).join(" ")}` : null;

  return (
    <tr className={t.aktif ? "" : "text-[#999]"}>
      <td className="font-semibold">{t.nama}</td>
      <td className="whitespace-nowrap">{t.kategoriLabel}</td>
      <td>{t.judul}</td>
      <td className="max-w-md text-[#555]">{t.isi}</td>
      <td className="font-mono text-xs">{t.variabel.length ? t.variabel.map((v) => `{{${v}}}`).join(" ") : "-"}</td>
      <td><StatusAktif aktif={t.aktif} kata={TAMPIL} /></td>
      {bisa && (
        <AksiBaris>
          <FormDialog gaya="baris" tombol="Ubah" judul={`Ubah templat: ${t.nama}`} desc="Berlaku untuk notifikasi berikutnya; notifikasi lama tidak berubah." busy={api.busy} galat={galat}
            onBatal={() => { setNama(t.nama); setKat(t.kategori); setJudul(t.judul); setIsi(t.isi); }}
            onSubmit={() => api.call(`/api/templat/${t.kode}`, { nama, kategori: kat, judul, isi }, "PATCH")}>
            <Field label="Nama templat"><input className={input} required value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
            <Field label="Kategori"><select className={input} value={kat} onChange={(e) => setKat(e.target.value)}>{kategori.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Judul"><input className={input} required value={judul} onChange={(e) => setJudul(e.target.value)} /></Field>
            <Field label="Isi pesan" hint={t.variabel.length ? `Variabel tersedia: ${t.variabel.map((v) => `{{${v}}}`).join(" ")}` : "Templat ini tidak memakai variabel."}>
              <textarea className="w-full p-3 text-[13px] font-normal" rows={6} required value={isi} onChange={(e) => setIsi(e.target.value)} />
            </Field>
          </FormDialog>
          <button className={btnBaris} disabled={api.busy} onClick={() => api.call(`/api/templat/${t.kode}`, { aktif: !t.aktif }, "PATCH")}>{t.aktif ? "Sembunyikan" : "Tampilkan"}</button>
          <HapusButton entitas="templat" refId={t.kode} nama={`templat ${t.nama}`} dipakai={t.dipakai} />
        </AksiBaris>
      )}
    </tr>
  );
}
