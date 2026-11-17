"use client";
import { useState } from "react";
import { AksiBaris, btnBaris, Field, FormDialog, InputRp, StatusAktif } from "@/components/form-dialog";
import { HapusButton } from "@/components/hapus-button";
import { Angka, Uang } from "@/components/table";
import { input, TAMPIL } from "@/components/ui";
import { useApi } from "@/components/use-api";
import type { Cara, Faskes, Kelas } from "@/lib/services/master";

const TIER = ["Saving+ Premium", "Saving+ Essential"];
const galatTeks = (api: { error: string | null; fields: Record<string, string> }) => (api.error ? `${api.error} ${Object.values(api.fields).join(", ")}` : null);
const hargaAwal = (faskes: Faskes[], h: Record<number, number>) => Object.fromEntries(faskes.map((f) => [f.id, h[f.id] ? String(h[f.id]) : ""]));
const hargaBody = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)]));

function HargaFields({ faskes, nilai, set, galat }: { faskes: Faskes[]; nilai: Record<string, string>; set: (v: Record<string, string>) => void; galat: Record<string, string> }) {
  return (
    <>
      {faskes.map((f) => (
        <Field key={f.id} label={`Harga di ${f.nama}`}>
          <InputRp required value={nilai[f.id] ?? ""} onChange={(x) => set({ ...nilai, [f.id]: x })} />
          {galat[`harga_${f.id}`] && <span className="text-xs font-normal text-red-600">{galat[`harga_${f.id}`]}</span>}
        </Field>
      ))}
    </>
  );
}

export function MasterBaris({ jenis, m, faskes, bisa }: { jenis: "cara" | "kelas"; m: Cara | Kelas; faskes: Faskes[]; bisa: boolean }) {
  const api = useApi();
  const tierAwal = "tier" in m ? m.tier : "";
  const minAwal = "setoran_min_bulanan" in m ? String(m.setoran_min_bulanan) : "";
  const [nama, setNama] = useState(m.nama);
  const [tier, setTier] = useState(tierAwal);
  const [min, setMin] = useState(minAwal);
  const [harga, setHarga] = useState(hargaAwal(faskes, m.harga));
  return (
    <tr className={m.aktif ? "" : "text-[#999]"}>
      <td className="font-semibold">{m.nama}</td>
      {jenis === "kelas" && <><td>{tierAwal}</td><Uang v={Number(minAwal)} /></>}
      {faskes.map((f) => <Uang key={f.id} v={m.harga[f.id]} />)}
      <Angka v={m.dipakai} />
      <td><StatusAktif aktif={m.aktif} kata={TAMPIL} /></td>
      {bisa && (
        <AksiBaris>
          <FormDialog gaya="baris" tombol="Ubah" judul={`Ubah ${jenis === "cara" ? "cara persalinan" : "kelas kamar"}`}
            desc={m.dipakai ? `Dipakai di ${m.dipakai} pendaftaran; pendaftaran lama menyimpan harganya sendiri.` : undefined}
            busy={api.busy} galat={galatTeks(api)} onBatal={() => { setNama(m.nama); setTier(tierAwal); setMin(minAwal); setHarga(hargaAwal(faskes, m.harga)); }}
            onSubmit={() => api.call(`/api/master/${jenis}/${m.id}`, { nama, harga: hargaBody(harga), ...(jenis === "kelas" ? { tier, setoran_min_bulanan: Number(min) } : {}) }, "PATCH")}>
            <Field label="Nama"><input className={input} required value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
            {jenis === "kelas" && <Field label="Tier"><select className={input} value={tier} onChange={(e) => setTier(e.target.value)}>{TIER.map((t) => <option key={t}>{t}</option>)}</select></Field>}
            {jenis === "kelas" && <Field label="Setoran minimum per bulan"><InputRp required value={min} onChange={setMin} /></Field>}
            <HargaFields faskes={faskes} nilai={harga} set={setHarga} galat={api.fields} />
          </FormDialog>
          <button className={btnBaris} disabled={api.busy} onClick={() => api.call(`/api/master/${jenis}/${m.id}`, { aktif: !m.aktif }, "PATCH")}>{m.aktif ? "Sembunyikan" : "Tampilkan"}</button>
          <HapusButton entitas={jenis} refId={m.id} nama={m.nama} dipakai={m.dipakai} />
        </AksiBaris>
      )}
    </tr>
  );
}

export function MasterBaru({ jenis, faskes }: { jenis: "cara" | "kelas"; faskes: Faskes[] }) {
  const api = useApi();
  const [nama, setNama] = useState("");
  const [tier, setTier] = useState(TIER[0]);
  const [min, setMin] = useState("");
  const [harga, setHarga] = useState<Record<string, string>>({});
  const label = jenis === "cara" ? "cara persalinan" : "kelas kamar";
  const reset = () => { setNama(""); setMin(""); setHarga({}); };
  return (
    <FormDialog tombol={`+ Tambah ${label}`} judul={`Tambah ${label}`} desc="Harga total pendaftaran = harga cara persalinan + harga kelas kamar di faskes yang dipilih." busy={api.busy} galat={galatTeks(api)} onBatal={reset}
      onSubmit={async () => {
        const ok = await api.call(`/api/master/${jenis}`, { nama, harga: hargaBody(harga), ...(jenis === "kelas" ? { tier, setoran_min_bulanan: Number(min) } : {}) });
        if (ok) reset();
        return ok;
      }}>
      <Field label="Nama"><input className={input} required value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
      {jenis === "kelas" && <Field label="Tier"><select className={input} value={tier} onChange={(e) => setTier(e.target.value)}>{TIER.map((t) => <option key={t}>{t}</option>)}</select></Field>}
      {jenis === "kelas" && <Field label="Setoran minimum per bulan"><InputRp required value={min} onChange={setMin} /></Field>}
      <HargaFields faskes={faskes} nilai={harga} set={setHarga} galat={api.fields} />
    </FormDialog>
  );
}
