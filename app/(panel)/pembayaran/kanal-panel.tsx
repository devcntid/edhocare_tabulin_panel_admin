"use client";
import { useState } from "react";
import { AksiBaris, btnBaris, Field, FormDialog, StatusAktif } from "@/components/form-dialog";
import { Angka } from "@/components/table";
import { HapusButton } from "@/components/hapus-button";
import { input, TAMPIL } from "@/components/ui";
import { useApi } from "@/components/use-api";

export type K = { id: number; kode: string; nama: string; deskripsi: string | null; aktif: boolean };
export type I = { id: number; kanal_id: number; judul: string; isi: string; nama_bank: string | null; nama_rekening: string | null; nomor_rekening: string | null; aktif: boolean };

const galatTeks = (api: { error: string | null; fields: Record<string, string> }) => (api.error ? `${api.error} ${Object.values(api.fields).join(" ")}` : null);
const area = "w-full p-3 text-[13px] font-normal";

export function KanalBaris({ k, jumlahInstruksi, bisa }: { k: K; jumlahInstruksi: number; bisa: boolean }) {
  const api = useApi();
  const [nama, setNama] = useState(k.nama);
  const [desk, setDesk] = useState(k.deskripsi ?? "");
  return (
    <tr className={k.aktif ? "" : "text-[#999]"}>
      <td className="whitespace-nowrap font-semibold">{k.nama}</td><td className="font-mono text-xs">{k.kode}</td><td>{k.deskripsi ?? "-"}</td>
      <Angka v={jumlahInstruksi} />
      <td><StatusAktif aktif={k.aktif} kata={TAMPIL} /></td>
      {bisa && (
        <AksiBaris>
          <FormDialog gaya="baris" tombol="Ubah" judul={`Ubah metode ${k.nama}`} busy={api.busy} galat={galatTeks(api)} onBatal={() => { setNama(k.nama); setDesk(k.deskripsi ?? ""); }}
            onSubmit={() => api.call(`/api/pembayaran/kanal/${k.id}`, { nama, deskripsi: desk }, "PATCH")}>
            <Field label="Nama"><input className={input} required value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
            <Field label="Deskripsi"><input className={input} value={desk} onChange={(e) => setDesk(e.target.value)} /></Field>
          </FormDialog>
          <button className={btnBaris} disabled={api.busy} onClick={() => api.call(`/api/pembayaran/kanal/${k.id}`, { aktif: !k.aktif }, "PATCH")}>{k.aktif ? "Sembunyikan" : "Tampilkan"}</button>
          <HapusButton entitas="kanal" refId={k.id} nama={`metode ${k.nama}`} dipakai={jumlahInstruksi} />
          {api.error && <span role="alert" className="text-xs text-red-600">{api.error}</span>}
        </AksiBaris>
      )}
    </tr>
  );
}

export function KanalBaru() {
  const api = useApi();
  const kosong = { kode: "", nama: "", deskripsi: "" };
  const [v, setV] = useState(kosong);
  return (
    <FormDialog tombol="+ Tambah metode" judul="Tambah metode pembayaran" desc="Metode baru nonaktif sampai diaktifkan." simpan="Simpan" busy={api.busy} galat={galatTeks(api)} onBatal={() => setV(kosong)}
      onSubmit={async () => {
        const ok = await api.call("/api/pembayaran/kanal", v);
        if (ok) setV(kosong);
        return ok;
      }}>
      <Field label="Kode" hint="Huruf kecil dan garis bawah."><input className={input} required placeholder="mis. transfer_bank" value={v.kode} onChange={(e) => setV({ ...v, kode: e.target.value })} /></Field>
      <Field label="Nama"><input className={input} required value={v.nama} onChange={(e) => setV({ ...v, nama: e.target.value })} /></Field>
      <Field label="Deskripsi (opsional)"><input className={input} value={v.deskripsi} onChange={(e) => setV({ ...v, deskripsi: e.target.value })} /></Field>
    </FormDialog>
  );
}

function CampurInstruksi({ v, setV }: { v: { judul: string; isi: string; nama_bank: string; nama_rekening: string; nomor_rekening: string }; setV: (x: typeof v) => void }) {
  return (
    <>
      <Field label="Judul"><input className={input} required value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></Field>
      <Field label="Isi instruksi"><textarea className={area} rows={4} required value={v.isi} onChange={(e) => setV({ ...v, isi: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama bank"><input className={input} value={v.nama_bank} onChange={(e) => setV({ ...v, nama_bank: e.target.value })} /></Field>
        <Field label="Nama rekening"><input className={input} value={v.nama_rekening} onChange={(e) => setV({ ...v, nama_rekening: e.target.value })} /></Field>
      </div>
      <Field label="Nomor rekening"><input className={input} inputMode="numeric" value={v.nomor_rekening} onChange={(e) => setV({ ...v, nomor_rekening: e.target.value })} /></Field>
    </>
  );
}

export function InstruksiBaris({ i, kanal, bisa }: { i: I; kanal: string; bisa: boolean }) {
  const api = useApi();
  const awal = { judul: i.judul, isi: i.isi, nama_bank: i.nama_bank ?? "", nama_rekening: i.nama_rekening ?? "", nomor_rekening: i.nomor_rekening ?? "" };
  const [v, setV] = useState(awal);
  return (
    <tr className={i.aktif ? "" : "text-[#999]"}>
      <td className="whitespace-nowrap">{kanal}</td><td className="font-semibold">{i.judul}</td><td className="max-w-md text-[#555]">{i.isi}</td>
      <td>{[i.nama_bank, i.nama_rekening].filter(Boolean).join(" · ") || "-"}</td>
      <td>{i.nomor_rekening ?? "-"}</td>
      <td><StatusAktif aktif={i.aktif} kata={TAMPIL} /></td>
      {bisa && (
        <AksiBaris>
          <FormDialog gaya="baris" tombol="Ubah" judul="Ubah instruksi pembayaran" desc={`Metode: ${kanal}`} busy={api.busy} galat={galatTeks(api)} onBatal={() => setV(awal)}
            onSubmit={() => api.call(`/api/pembayaran/instruksi/${i.id}`, v, "PATCH")}>
            <CampurInstruksi v={v} setV={setV} />
          </FormDialog>
          <button className={btnBaris} disabled={api.busy} onClick={() => api.call(`/api/pembayaran/instruksi/${i.id}`, { aktif: !i.aktif }, "PATCH")}>{i.aktif ? "Sembunyikan" : "Tampilkan"}</button>
          <HapusButton entitas="instruksi" refId={i.id} nama={`instruksi "${i.judul}"`} dipakai={0} />
        </AksiBaris>
      )}
    </tr>
  );
}

export function InstruksiBaru({ kanal }: { kanal: { id: number; nama: string }[] }) {
  const api = useApi();
  const kosong = { judul: "", isi: "", nama_bank: "", nama_rekening: "", nomor_rekening: "" };
  const [kanalId, setKanalId] = useState("");
  const [v, setV] = useState(kosong);
  const reset = () => { setV(kosong); setKanalId(""); };
  return (
    <FormDialog tombol="+ Tambah instruksi" judul="Tambah instruksi pembayaran" busy={api.busy} galat={galatTeks(api)} onBatal={reset}
      onSubmit={async () => {
        const ok = await api.call("/api/pembayaran/instruksi", { ...v, kanal_id: Number(kanalId) });
        if (ok) reset();
        return ok;
      }}>
      <Field label="Metode pembayaran">
        <select className={input} required value={kanalId} onChange={(e) => setKanalId(e.target.value)}>
          <option value="">Pilih metode…</option>
          {kanal.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
        </select>
      </Field>
      <CampurInstruksi v={v} setV={setV} />
    </FormDialog>
  );
}
