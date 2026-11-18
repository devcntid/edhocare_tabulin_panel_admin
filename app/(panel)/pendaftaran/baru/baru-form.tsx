"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/form-dialog";
import { SelectCari } from "@/components/select-cari";
import { toast } from "@/components/toast";
import { btnPrimary, input } from "@/components/ui";
import { fmtRp } from "@/lib/format";
import type { OpsiHarga, OpsiPasien } from "@/lib/services/pendaftaran";

type Opsi = { faskes: { id: number; nama: string }[]; cara: OpsiHarga[]; kelas: (OpsiHarga & { tier: string; setoran_min_bulanan: number })[]; pasien: OpsiPasien[] };
const baca = "bg-[#f4f5f7] text-[#555]";

/** Registration: the patient is picked from patient data (name, No. RM, phone are read-only); faskes, cara persalinan and kelas kamar are chosen separately. Total = harga cara + harga kelas at the chosen faskes. */
export function BaruForm({ opsi, hariIni }: { opsi: Opsi; hariIni: string }) {
  const router = useRouter();
  const [v, setV] = useState({ no_rm: "", faskes_id: "", cara: "", kelas: "", jumlah_cicilan: "6", hpht: "" });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const pasien = opsi.pasien.find((p) => p.no_rm === v.no_rm);
  const faskesId = Number(v.faskes_id);
  const cara = opsi.cara.find((c) => c.nama === v.cara);
  const kelas = opsi.kelas.find((k) => k.nama === v.kelas);
  const hCara = cara?.harga[faskesId];
  const hKelas = kelas?.harga[faskesId];
  const total = hCara != null && hKelas != null ? hCara + hKelas : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (total == null) return;
    setBusy(true);
    setError(null);
    setFields({});
    const res = await fetch("/api/pendaftaran", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ no_rm: v.no_rm, faskes_id: v.faskes_id, cara_persalinan: v.cara, kelas_kamar: v.kelas, jumlah_cicilan: v.jumlah_cicilan, hpht: v.hpht }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      toast("Pendaftaran berhasil dibuat.");
      router.push(`/pendaftaran/${json.data.id}`);
      router.refresh();
      return;
    }
    setError(json?.error?.message ?? "Gagal menyimpan.");
    setFields(json?.error?.fields ?? {});
    setBusy(false);
  }
  const galat = (k: string) => fields[k] && <span className="text-xs font-normal text-red-600">{fields[k]}</span>;

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#e1eaf2] bg-white p-6">
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-bold">Pasien</legend>
        <Field label="Pilih pasien" hint="Ketik nama, No. RM, atau No. HP untuk mencari. Data pasien berasal dari sistem RS.">
          <SelectCari ariaLabel="Pasien" placeholder="Cari dan pilih pasien…" value={v.no_rm} onChange={(x) => setV({ ...v, no_rm: x })}
            opsi={opsi.pasien.map((p) => ({ value: p.no_rm, label: `${p.nama} · ${p.no_rm}`, sub: p.no_hp, disabled: p.berjalan, alasan: "sudah punya pendaftaran berjalan" }))} />
          {galat("no_rm")}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nama pasien"><input className={`${input} ${baca}`} readOnly tabIndex={-1} value={pasien?.nama ?? ""} placeholder="-" /></Field>
          <Field label="No. RM"><input className={`${input} ${baca}`} readOnly tabIndex={-1} value={pasien?.no_rm ?? ""} placeholder="-" /></Field>
          <Field label="No. HP"><input className={`${input} ${baca}`} readOnly tabIndex={-1} value={pasien?.no_hp ?? ""} placeholder="-" /></Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-bold">Paket dan harga</legend>
        <Field label="Faskes">
          <SelectCari ariaLabel="Faskes" placeholder="Cari dan pilih faskes…" value={v.faskes_id} onChange={(x) => setV({ ...v, faskes_id: x })}
            opsi={opsi.faskes.map((f) => ({ value: String(f.id), label: f.nama }))} />
          {galat("faskes_id")}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cara persalinan">
            <SelectCari ariaLabel="Cara persalinan" placeholder="Cari dan pilih cara persalinan…" value={v.cara} onChange={(x) => setV({ ...v, cara: x })}
              opsi={opsi.cara.map((c) => ({ value: c.nama, label: c.nama, sub: faskesId && c.harga[faskesId] ? fmtRp(c.harga[faskesId]) : undefined }))} />
          </Field>
          <Field label="Kelas kamar">
            <SelectCari ariaLabel="Kelas kamar" placeholder="Cari dan pilih kelas kamar…" value={v.kelas} onChange={(x) => setV({ ...v, kelas: x })}
              opsi={opsi.kelas.map((k) => ({ value: k.nama, label: k.nama, sub: faskesId && k.harga[faskesId] ? fmtRp(k.harga[faskesId]) : undefined }))} />
            {galat("kelas_kamar")}
          </Field>
        </div>
        {total != null && kelas && (
          <dl className="grid gap-1 rounded-lg bg-[#f4f5f7] px-3 py-2 text-[13px]">
            <div className="flex justify-between"><dt>Cara persalinan ({v.cara})</dt><dd className="tabular-nums">{fmtRp(hCara!)}</dd></div>
            <div className="flex justify-between"><dt>Kelas kamar ({v.kelas})</dt><dd className="tabular-nums">{fmtRp(hKelas!)}</dd></div>
            <div className="flex justify-between border-t border-[#cfdde8] pt-1 font-bold"><dt>Total biaya</dt><dd className="tabular-nums">{fmtRp(total)}</dd></div>
            <p className="pt-1 text-xs text-[#666]">{kelas.tier} · setoran minimum {fmtRp(kelas.setoran_min_bulanan)}/bulan. Sisa biaya dilunasi di akhir memakai saldo tabungan.</p>
          </dl>
        )}
        {v.faskes_id && v.cara && v.kelas && total == null && <p className="text-[13px] text-red-600">Harga belum diatur untuk pilihan ini.</p>}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-bold">Kehamilan dan cicilan</legend>
        <Field label="HPHT"><input className={input} type="date" required max={hariIni} value={v.hpht} onChange={(e) => setV({ ...v, hpht: e.target.value })} />{galat("hpht")}</Field>
        <Field label="Jumlah cicilan (kali)"><input className={input} type="number" min={1} max={24} required value={v.jumlah_cicilan} onChange={(e) => setV({ ...v, jumlah_cicilan: e.target.value })} />{galat("jumlah_cicilan")}</Field>
      </fieldset>
      <p className="text-[13px] text-[#666]">DP, jadwal, dan nominal cicilan dihitung otomatis saat pendaftaran disimpan.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      <button className={btnPrimary} disabled={busy || total == null || !pasien}>{busy ? "Menyimpan…" : "Simpan pendaftaran"}</button>
    </form>
  );
}
