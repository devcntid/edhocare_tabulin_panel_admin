"use client";
import { useState } from "react";
import { Field, FormDialog, InputRp } from "@/components/form-dialog";
import { input } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { fmtRp } from "@/lib/format";

export type TagihanTerbuka = { id: number; nomor: string; nominal: number };

/**
 * Manual deposit confirmation (finance): a bank transfer checked in the mutation list. Used on the registration detail page and as a
 * shortcut on the bills list (`awal` preselects the bill and its nominal). Rules (H+1, under-payment) are enforced by konfirmasi_setoran.
 */
export function KonfirmasiSetoran({ id, tagihan, tanggalMaks, awal, gaya = "utama", tombol = "Konfirmasi setoran manual" }: {
  id: number;
  tagihan: TagihanTerbuka[];
  /** Latest allowed transfer date: yesterday (H+1). */
  tanggalMaks: string;
  /** Bill id preselected when the dialog opens. */
  awal?: number;
  gaya?: "utama" | "baris";
  tombol?: string;
}) {
  const api = useApi();
  const nominalAwal = String(tagihan.find((t) => t.id === awal)?.nominal ?? "");
  const [tanggal, setTanggal] = useState("");
  const [tagihanId, setTagihanId] = useState(awal ? String(awal) : "");
  const [nominal, setNominal] = useState(nominalAwal);
  const reset = () => { setTanggal(""); setTagihanId(awal ? String(awal) : ""); setNominal(nominalAwal); };
  const pilih = (v: string) => { setTagihanId(v); const t = tagihan.find((x) => String(x.id) === v); if (t) setNominal(String(t.nominal)); };
  return (
    <FormDialog gaya={gaya} tombol={tombol} judul="Konfirmasi setoran manual" desc="Setoran transfer bank yang sudah dicek di mutasi. Saldo bertambah dan tagihan terkait lunas." simpan="Konfirmasi"
      busy={api.busy} galat={api.error ? `${api.error} ${Object.values(api.fields).join(" ")}` : null} onBatal={reset}
      onSubmit={async () => {
        const ok = await api.call(`/api/pendaftaran/${id}/setoran`, { tanggal_bayar: tanggal, nominal: Number(nominal), tagihan_id: tagihanId ? Number(tagihanId) : null });
        if (ok) reset();
        return ok;
      }}>
      <Field label="Tanggal transfer" hint="Paling lambat kemarin: konfirmasi paling cepat H+1.">
        <input className={input} type="date" required max={tanggalMaks} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </Field>
      <Field label="Untuk tagihan" hint="Nominal tidak boleh kurang dari nominal tagihan. Tanpa tagihan dicatat sebagai setoran tambahan.">
        <select className={input} value={tagihanId} onChange={(e) => pilih(e.target.value)}>
          <option value="">Setoran tambahan (tanpa tagihan)</option>
          {tagihan.map((t) => <option key={t.id} value={t.id}>{t.nomor} · {fmtRp(t.nominal)}</option>)}
        </select>
      </Field>
      <Field label="Nominal"><InputRp required value={nominal} onChange={setNominal} /></Field>
    </FormDialog>
  );
}
