"use client";
import { useState } from "react";
import { AksiBaris, btnBaris, Field, FormDialog, InputRp } from "@/components/form-dialog";
import { Uang } from "@/components/table";
import { useApi } from "@/components/use-api";
import type { Faskes, TarifBaris } from "@/lib/services/master";

const galatTeks = (api: { error: string | null; fields: Record<string, string> }) => (api.error ? `${api.error} ${Object.values(api.fields).join(", ")}` : null);
const awal = (faskes: Faskes[], t: TarifBaris) => Object.fromEntries(faskes.map((f) => [f.id, t.tarif[f.id] ? String(t.tarif[f.id]) : ""]));

/** Where the tariff comes from: the package's own tariff (BRD) or cara price + kelas price. */
function sumber(faskes: Faskes[], t: TarifBaris) {
  const n = faskes.filter((f) => t.eksplisit[f.id]).length;
  return n === 0 ? "Cara + kelas" : n === faskes.length ? "Tarif paket" : "Sebagian tarif paket";
}

export function TarifBarisRow({ t, faskes, bisa }: { t: TarifBaris; faskes: Faskes[]; bisa: boolean }) {
  const api = useApi();
  const [harga, setHarga] = useState(awal(faskes, t));
  const ada = faskes.some((f) => t.eksplisit[f.id]);
  const body = (h: Record<string, string> | null) => ({ cara_id: t.cara_id, kelas_id: t.kelas_id, harga: h && Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)])) });
  return (
    <tr>
      <td className="font-semibold">{t.cara}</td>
      <td>{t.kelas}</td>
      {faskes.map((f) => (t.tarif[f.id] == null ? <td key={f.id}>-</td> : <Uang key={f.id} v={t.tarif[f.id]} />))}
      <td>{sumber(faskes, t)}</td>
      {bisa && (
        <AksiBaris galat={galatTeks(api)}>
          <FormDialog gaya="baris" tombol="Ubah tarif" judul={`Ubah tarif ${t.cara} · ${t.kelas}`}
            desc="Tarif total paket di tiap faskes. Pendaftaran yang sudah ada menyimpan tarifnya sendiri dan tidak berubah."
            busy={api.busy} galat={galatTeks(api)} onBatal={() => setHarga(awal(faskes, t))}
            onSubmit={() => api.call("/api/master/paket", body(harga), "PATCH")}>
            {faskes.map((f) => (
              <Field key={f.id} label={`Tarif di ${f.nama}`}>
                <InputRp required value={harga[f.id] ?? ""} onChange={(x) => setHarga({ ...harga, [f.id]: x })} />
                {api.fields[`harga_${f.id}`] && <span className="text-xs font-normal text-red-600">{api.fields[`harga_${f.id}`]}</span>}
              </Field>
            ))}
          </FormDialog>
          {ada && <button className={btnBaris} disabled={api.busy} title="Hapus tarif paket; tarif kembali dihitung dari harga cara + kelas" onClick={() => api.call("/api/master/paket", body(null), "PATCH")}>Pakai cara + kelas</button>}
        </AksiBaris>
      )}
    </tr>
  );
}
