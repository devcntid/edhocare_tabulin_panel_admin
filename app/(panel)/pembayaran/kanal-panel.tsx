"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GripVertical, ImagePlus } from "lucide-react";
import { AksiBaris, btnBarisTukar, Field, FormDialog, StatusAktif } from "@/components/form-dialog";
import { Table } from "@/components/table";
import { HapusButton } from "@/components/hapus-button";
import { input, TAMPIL } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { JENIS_KANAL, type JenisKanal } from "@/lib/format";

export type K = { id: number; kode: string; nama: string; deskripsi: string | null; aktif: boolean; jenis: JenisKanal; ada_logo: boolean; versi_logo: number | null };
export type I = { id: number; kanal_id: number; judul: string; isi: string; nama_bank: string | null; nama_rekening: string | null; nomor_rekening: string | null; aktif: boolean };

const galatTeks = (api: { error: string | null; fields: Record<string, string> }) => (api.error ? `${api.error} ${Object.values(api.fields).join(" ")}` : null);
const pilihJenis = (v: string, set: (x: JenisKanal) => void) => (
  <select className={input} value={v} onChange={(e) => set(e.target.value as JenisKanal)}>
    {(Object.keys(JENIS_KANAL) as JenisKanal[]).map((j) => <option key={j} value={j}>{JENIS_KANAL[j]}</option>)}
  </select>
);
const area = "w-full p-3 text-[13px] font-normal";

const TIPE_GAMBAR = ["image/png", "image/jpeg", "image/webp"];
const MAKS_GAMBAR = 512 * 1024;
const srcLogo = (k: K) => `/api/pembayaran/kanal/${k.id}/logo?v=${k.versi_logo ?? 0}`;
/** Client-side check so a wrong file is refused before upload; the API checks again. Returns an error text or null. */
const cekGambar = (f: File) => (!TIPE_GAMBAR.includes(f.type) ? "Gunakan gambar PNG, JPG, atau WebP." : f.size > MAKS_GAMBAR ? "Ukuran gambar maksimal 512 KB." : null);

async function kirimGambar(id: number, f: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", f);
  const res = await fetch(`/api/pembayaran/kanal/${id}/logo`, { method: "PUT", body: fd }).catch(() => null);
  if (!res) return "Tidak dapat menghubungi server.";
  return res.ok ? null : ((await res.json().catch(() => ({})))?.error?.message ?? "Gambar gagal diunggah.");
}
async function hapusGambar(id: number): Promise<string | null> {
  const res = await fetch(`/api/pembayaran/kanal/${id}/logo`, { method: "DELETE" }).catch(() => null);
  return res?.ok ? null : "Gambar gagal dihapus.";
}

function Logo({ k, kecil }: { k: Pick<K, "nama"> & Partial<K>; kecil?: boolean }) {
  const ukuran = kecil ? "h-8 w-8" : "h-10 w-10";
  // eslint-disable-next-line @next/next/no-img-element -- admin-only image served by an authenticated route; next/image cannot use it
  if (k.id && k.ada_logo) return <img src={srcLogo(k as K)} alt="" className={`${ukuran} shrink-0 rounded-lg border border-[#e1eaf2] bg-white object-contain p-0.5`} />;
  return <span aria-hidden className={`${ukuran} inline-flex shrink-0 items-center justify-center rounded-lg bg-[#eef6fb] text-xs font-bold uppercase text-[var(--primary)]`}>{k.nama.trim().slice(0, 2) || "?"}</span>;
}

/** Image field of the method dialogs: choose a file or drop one on the box. `awal` is the saved image, if any. */
function PilihGambar({ awal, file, setFile, hapus, setHapus }: { awal: K | null; file: File | null; setFile: (f: File | null) => void; hapus: boolean; setHapus: (b: boolean) => void }) {
  const [galat, setGalat] = useState<string | null>(null);
  const [atas, setAtas] = useState(false);
  const [lokal, setLokal] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setLokal(null); return; }
    const u = URL.createObjectURL(file);
    setLokal(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const pilih = (f: File | undefined) => {
    if (!f) return;
    const g = cekGambar(f);
    setGalat(g);
    if (!g) { setFile(f); setHapus(false); }
  };
  const tampil = lokal ?? (awal?.ada_logo && !hapus ? srcLogo(awal) : null);
  return (
    <div className="grid gap-1.5 text-[13px] font-semibold">
      Gambar (opsional)
      <label
        onDragOver={(e) => { e.preventDefault(); setAtas(true); }} onDragLeave={() => setAtas(false)}
        onDrop={(e) => { e.preventDefault(); setAtas(false); pilih(e.dataTransfer.files[0]); }}
        className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 font-normal ${atas ? "border-[var(--primary)] bg-[#eef6fb]" : "border-[#b9cddb] bg-white hover:bg-[#f8fbfd]"}`}>
        {tampil
          // eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) or authenticated admin route
          ? <img src={tampil} alt="Pratinjau gambar" className="h-14 w-14 shrink-0 rounded-lg border border-[#e1eaf2] bg-white object-contain p-0.5" />
          : <span aria-hidden className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#eef6fb] text-[var(--primary)]"><ImagePlus size={22} /></span>}
        <span className="text-[13px] text-[#5b6b78]">{file ? file.name : "Seret gambar ke sini atau klik untuk memilih. PNG, JPG, atau WebP, maksimal 512 KB."}</span>
        <input type="file" accept={TIPE_GAMBAR.join(",")} className="sr-only" onChange={(e) => { pilih(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {galat && <span role="alert" className="text-xs font-normal text-red-600">{galat}</span>}
      {(file || (awal?.ada_logo && !hapus)) && (
        <button type="button" className="justify-self-start text-xs font-semibold text-red-700 hover:underline" onClick={() => { setFile(null); setHapus(!!awal?.ada_logo); setGalat(null); }}>
          {file && awal?.ada_logo ? "Batalkan gambar baru" : "Hapus gambar"}
        </button>
      )}
    </div>
  );
}

/**
 * Drag-to-reorder for a list of `{ id }` items. Only the handle starts a drag (`siap`), so text inside dialogs and inputs stays selectable.
 * The order saves when the drag ends. Chrome can skip `dragend` on an element that moved in the DOM during the drag, so `drop` finishes it too.
 * The server order wins again after every refresh.
 */
function useUrutan<T extends { id: number }>(asli: T[], url: string, ekstra?: Record<string, unknown>) {
  const api = useApi();
  const [urut, setUrut] = useState(asli);
  const [seret, setSeret] = useState<number | null>(null);
  const [siap, setSiap] = useState<number | null>(null);
  const sebelum = useRef("");
  const terbaru = useRef(urut);
  terbaru.current = urut;
  useEffect(() => setUrut(asli), [asli]);
  const kunci = (a: T[]) => a.map((x) => x.id).join(",");
  const simpan = async (a: T[]) => { if (!(await api.call(url, { ...ekstra, ids: a.map((x) => x.id) }))) setUrut(asli); };
  const taruh = (a: T[], id: number, ke: number) => { const b = a.filter((x) => x.id !== id); b.splice(Math.max(0, Math.min(ke, b.length)), 0, a.find((x) => x.id === id)!); return b; };
  const selesai = () => {
    setSeret(null);
    setSiap(null);
    if (!sebelum.current) return;
    const dulu = sebelum.current;
    sebelum.current = "";
    if (kunci(terbaru.current) !== dulu) void simpan(terbaru.current);
  };
  /** Props for the element that moves (a card or a table row). */
  const barisProps = (x: T) => ({
    draggable: siap === x.id,
    onDragStart: (e: React.DragEvent) => {
      if (e.target !== e.currentTarget) return; // a drag that started in a nested list is not ours
      sebelum.current = kunci(urut); setSeret(x.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(x.id));
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (seret == null || seret === x.id) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const sesudah = e.clientY > r.top + r.height / 2;
      setUrut((u) => { const b = taruh(u, seret, u.filter((y) => y.id !== seret).findIndex((y) => y.id === x.id) + (sesudah ? 1 : 0)); return kunci(b) === kunci(u) ? u : b; });
    },
    onDrop: (e: React.DragEvent) => { if (seret != null) { e.preventDefault(); selesai(); } },
    onDragEnd: selesai,
    className: seret === x.id ? "opacity-40" : "",
  });
  /** The grip button. Arrow up / down on it moves the item and saves at once (for keyboard users). */
  const gagang = (x: T, i: number, nama: string) => (
    <button type="button" disabled={api.busy} aria-label={`Pindahkan ${nama}. Seret, atau tekan panah atas dan bawah.`} title="Seret untuk mengubah urutan"
      className="inline-flex cursor-grab touch-none rounded-md p-1 text-[#7a8b98] hover:bg-[#eef6fb] hover:text-[var(--primary)] active:cursor-grabbing disabled:opacity-40"
      onPointerDown={() => setSiap(x.id)} onPointerUp={() => setSiap(null)}
      onKeyDown={(e) => {
        const arah = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (!arah || i + arah < 0 || i + arah >= urut.length) return;
        e.preventDefault();
        const b = taruh(urut, x.id, i + arah);
        setUrut(b);
        void simpan(b);
      }}><GripVertical size={16} aria-hidden /></button>
  );
  return { urut, barisProps, gagang, api, seret, selesai };
}

const SEMUA_KOSONG: I[] = [];

const KUNCI_BUKA = "tabulin:metode-terbuka";
const bacaBuka = (): number[] => {
  try { const v = JSON.parse(localStorage.getItem(KUNCI_BUKA) ?? "[]"); return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []; } catch { return []; }
};
/** Open/closed state of one method's instruksi. Closed by default; what was last opened is remembered in this browser (read after mount so the server render matches). */
function useBukaTersimpan(id: number) {
  const [buka, setBuka] = useState(false);
  useEffect(() => setBuka(bacaBuka().includes(id)), [id]);
  return [buka, (b: boolean) => {
    setBuka(b);
    try { localStorage.setItem(KUNCI_BUKA, JSON.stringify([...bacaBuka().filter((x) => x !== id), ...(b ? [id] : [])])); } catch { /* storage blocked: the state just is not remembered */ }
  }] as const;
}

/** Lets the nested instruksi panel accept the drop of a dragged method, so the drag always ends with a save. */
type Jatuh = { aktif: boolean; selesai: () => void };

function InstruksiBaris({ i, bisa, baris, gagang }: { i: I; bisa: boolean; baris: React.HTMLAttributes<HTMLTableRowElement>; gagang: React.ReactNode }) {
  const api = useApi();
  const awal = { judul: i.judul, isi: i.isi, nama_bank: i.nama_bank ?? "", nama_rekening: i.nama_rekening ?? "", nomor_rekening: i.nomor_rekening ?? "" };
  const [v, setV] = useState(awal);
  return (
    <tr {...baris} className={`${i.aktif ? "" : "text-[#999]"} ${baris.className ?? ""}`}>
      {bisa && <td className="w-px !pr-0">{gagang}</td>}
      <td className="font-semibold">{i.judul}</td><td className="max-w-md text-[#555]">{i.isi}</td>
      <td>{[i.nama_bank, i.nama_rekening].filter(Boolean).join(" · ") || "-"}</td>
      <td>{i.nomor_rekening ?? "-"}</td>
      <td><StatusAktif aktif={i.aktif} kata={TAMPIL} /></td>
      {bisa && (
        <AksiBaris galat={api.error}>
          <FormDialog gaya="baris" tombol="Ubah" judul="Ubah instruksi pembayaran" busy={api.busy} galat={galatTeks(api)} onBatal={() => setV(awal)}
            onSubmit={() => api.call(`/api/pembayaran/instruksi/${i.id}`, v, "PATCH")}>
            <CampurInstruksi v={v} setV={setV} />
          </FormDialog>
          <button className={btnBarisTukar} disabled={api.busy} onClick={() => api.call(`/api/pembayaran/instruksi/${i.id}`, { aktif: !i.aktif }, "PATCH")}>{i.aktif ? "Sembunyikan" : "Tampilkan"}</button>
          <HapusButton entitas="instruksi" refId={i.id} nama={`instruksi "${i.judul}"`} dipakai={0} />
        </AksiBaris>
      )}
    </tr>
  );
}

function InstruksiBaru({ kanal }: { kanal: { id: number; nama: string } }) {
  const api = useApi();
  const kosong = { judul: "", isi: "", nama_bank: "", nama_rekening: "", nomor_rekening: "" };
  const [v, setV] = useState(kosong);
  return (
    <FormDialog gaya="baris" tombol="+ Tambah instruksi" judul="Tambah instruksi pembayaran" desc={`Metode: ${kanal.nama}`} busy={api.busy} galat={galatTeks(api)} onBatal={() => setV(kosong)}
      onSubmit={async () => {
        const ok = await api.call("/api/pembayaran/instruksi", { ...v, kanal_id: kanal.id });
        if (ok) setV(kosong);
        return ok;
      }}>
      <CampurInstruksi v={v} setV={setV} />
    </FormDialog>
  );
}

type GrupProps = { k: K; instruksi: I[]; bisa: boolean; baris: React.HTMLAttributes<HTMLTableRowElement>; gagang: React.ReactNode; jatuh: Jatuh };

/** One method as a row of the table, followed by a nested table with its instruksi. Drop an image on the method's name to replace its image. */
function KanalGrup({ k, instruksi, bisa, baris, gagang, jatuh }: GrupProps) {
  const api = useApi();
  const router = useRouter();
  const ur = useUrutan(instruksi, "/api/pembayaran/instruksi/urutan", { kanal_id: k.id });
  const [buka, setBuka] = useBukaTersimpan(k.id);
  const [nama, setNama] = useState(k.nama);
  const [desk, setDesk] = useState(k.deskripsi ?? "");
  const [jenis, setJenis] = useState<JenisKanal>(k.jenis);
  const [gambar, setGambar] = useState<File | null>(null);
  const [hapusG, setHapusG] = useState(false);
  const [galatG, setGalatG] = useState<string | null>(null);
  const [atas, setAtas] = useState(false);
  const reset = () => { setNama(k.nama); setDesk(k.deskripsi ?? ""); setJenis(k.jenis); setGambar(null); setHapusG(false); setGalatG(null); };
  const adaFile = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const jatuhkan = async (f: File | undefined) => {
    if (!f) return;
    const g = cekGambar(f) ?? (await kirimGambar(k.id, f));
    setGalatG(g);
    if (!g) router.refresh();
  };
  const kolom = (bisa ? 7 : 5);
  return (
    <>
      <tr {...baris} className={`bg-white ${k.aktif ? "" : "text-[#999]"} ${baris.className ?? ""}`}>
        {bisa && <td className={`w-px !pr-0 ${k.aktif ? "shadow-[inset_4px_0_0_var(--biru-merek)]" : "shadow-[inset_4px_0_0_#c5cdd3]"}`}>{gagang}</td>}
        <td className={atas ? "bg-[#eef6fb]" : ""}
          onDragOver={bisa ? (e) => { if (adaFile(e)) { e.preventDefault(); setAtas(true); } } : undefined} onDragLeave={() => setAtas(false)}
          onDrop={bisa ? (e) => { if (adaFile(e)) { e.preventDefault(); setAtas(false); void jatuhkan(e.dataTransfer.files[0]); } } : undefined}>
          <div className="flex items-center gap-2">
            <button type="button" aria-expanded={buka} aria-label={`${buka ? "Tutup" : "Buka"} instruksi ${k.nama}`} onClick={() => setBuka(!buka)} className="rounded-md p-1 text-[#5b6b78] hover:bg-[#eef6fb]">
              <ChevronDown size={16} aria-hidden className={`transition-transform ${buka ? "" : "-rotate-90"}`} />
            </button>
            <Logo k={k} />
            <div className="min-w-0">
              <div className="whitespace-nowrap font-semibold">{k.nama}</div>
              {k.deskripsi && <div className="max-w-xs text-xs font-normal text-[#5b6b78]">{k.deskripsi}</div>}
              {galatG && <div role="alert" className="text-xs font-normal text-red-600">{galatG}</div>}
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap">{JENIS_KANAL[k.jenis]}</td>
        <td className="font-mono text-xs">{k.kode}</td>
        <td className="whitespace-nowrap tabular-nums">{instruksi.length} instruksi</td>
        <td><StatusAktif aktif={k.aktif} kata={TAMPIL} /></td>
        {bisa && (
          <AksiBaris galat={api.error}>
            <FormDialog gaya="baris" tombol="Ubah" judul={`Ubah metode ${k.nama}`} busy={api.busy} galat={galatTeks(api) ?? galatG} onBatal={reset}
              onSubmit={async () => {
                setGalatG(null);
                if (!(await api.call(`/api/pembayaran/kanal/${k.id}`, { nama, deskripsi: desk, jenis }, "PATCH"))) return false;
                const g = hapusG ? await hapusGambar(k.id) : gambar ? await kirimGambar(k.id, gambar) : null;
                if (g) { setGalatG(`Perubahan tersimpan, tetapi ${g.charAt(0).toLowerCase()}${g.slice(1)}`); return false; }
                if (hapusG || gambar) router.refresh();
                setGambar(null); setHapusG(false);
                return true;
              }}>
              <Field label="Nama"><input className={input} required value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
              <Field label="Jenis" hint="Virtual account masuk otomatis. Transfer bank manual dan tunai muncul sebagai pilihan saat keuangan mengonfirmasi setoran.">{pilihJenis(jenis, setJenis)}</Field>
              <Field label="Deskripsi"><input className={input} value={desk} onChange={(e) => setDesk(e.target.value)} /></Field>
              <PilihGambar awal={k} file={gambar} setFile={setGambar} hapus={hapusG} setHapus={setHapusG} />
            </FormDialog>
            <button className={btnBarisTukar} disabled={api.busy} onClick={() => api.call(`/api/pembayaran/kanal/${k.id}`, { aktif: !k.aktif }, "PATCH")}>{k.aktif ? "Sembunyikan" : "Tampilkan"}</button>
            <HapusButton entitas="kanal" refId={k.id} nama={`metode ${k.nama}`} dipakai={instruksi.length} />
          </AksiBaris>
        )}
      </tr>
      {buka && (
        <tr className="!bg-white" onDragOver={(e) => { if (jatuh.aktif) e.preventDefault(); }} onDrop={(e) => { if (jatuh.aktif) { e.preventDefault(); jatuh.selesai(); } }}>
          <td colSpan={kolom} className="!p-0">
            <div className="ml-10 border-l-2 border-[var(--biru-merek)] bg-white">
              {ur.urut.length > 0 && (
                <div className="[&_thead]:bg-[#eef6fb]">
                  <Table polos head={[...(bisa ? [""] : []), "Judul", "Isi", "Bank · Rekening", "No. rekening", "Status", ...(bisa ? ["Aksi"] : [])]}>
                    {ur.urut.map((i, n) => <InstruksiBaris key={i.id} i={i} bisa={bisa} baris={bisa ? ur.barisProps(i) : {}} gagang={ur.gagang(i, n, i.judul)} />)}
                  </Table>
                </div>
              )}
              {(bisa || !ur.urut.length) && (
                <div className="flex flex-wrap items-center gap-3 border-t border-[#edf1f5] px-4 py-2 text-[13px] text-[#5b6b78]">
                  {bisa && <InstruksiBaru kanal={k} />}
                  {!ur.urut.length && "Belum ada instruksi."}
                  {ur.api.error && <span role="alert" className="text-xs text-red-600">{ur.api.error}</span>}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Every payment method as a row of one table, with its instruksi in a nested table under it. Methods and instruksi are both reordered by dragging. */
export function KanalDaftar({ kanal, instruksi, bisa, filtered }: { kanal: K[]; instruksi: I[]; bisa: boolean; filtered?: boolean }) {
  const grup = useMemo(() => { const m = new Map<number, I[]>(); for (const i of instruksi) m.set(i.kanal_id, [...(m.get(i.kanal_id) ?? []), i]); return m; }, [instruksi]);
  const { urut, barisProps, gagang, api, seret, selesai } = useUrutan(kanal, "/api/pembayaran/kanal/urutan");
  const jatuh: Jatuh = { aktif: seret != null, selesai };
  return (
    <>
      {api.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{api.error}</p>}
      <Table head={[...(bisa ? [""] : []), "Metode", "Jenis", "Kode", "Instruksi", "Status", ...(bisa ? ["Aksi"] : [])]} empty={!urut.length} filtered={filtered} resetHref="/pembayaran">
        {urut.map((k, n) => <KanalGrup key={k.id} k={k} instruksi={grup.get(k.id) ?? SEMUA_KOSONG} bisa={bisa} baris={bisa ? barisProps(k) : {}} gagang={gagang(k, n, k.nama)} jatuh={jatuh} />)}
      </Table>
    </>
  );
}

export function KanalBaru() {
  const api = useApi();
  const router = useRouter();
  const kosong = { kode: "", nama: "", deskripsi: "", jenis: "va" as JenisKanal };
  const [v, setV] = useState(kosong);
  const [gambar, setGambar] = useState<File | null>(null);
  const [galatG, setGalatG] = useState<string | null>(null);
  const reset = () => { setV(kosong); setGambar(null); setGalatG(null); };
  return (
    <FormDialog tombol="+ Tambah metode" judul="Tambah metode pembayaran" desc="Metode baru nonaktif sampai diaktifkan." simpan="Simpan" busy={api.busy} galat={galatTeks(api) ?? galatG} onBatal={reset}
      onSubmit={async () => {
        setGalatG(null);
        if (!(await api.call("/api/pembayaran/kanal", v))) return false;
        const id = (api.hasil.current as { id?: number } | null)?.id;
        if (gambar && id) {
          const g = await kirimGambar(id, gambar);
          if (g) { router.refresh(); setV(kosong); setGambar(null); setGalatG(`Metode tersimpan, tetapi ${g.charAt(0).toLowerCase()}${g.slice(1)} Tambahkan gambar lewat tombol Ubah.`); return false; }
          router.refresh();
        }
        reset();
        return true;
      }}>
      <Field label="Kode" hint="Huruf kecil dan garis bawah."><input className={input} required placeholder="mis. transfer_bank" value={v.kode} onChange={(e) => setV({ ...v, kode: e.target.value })} /></Field>
      <Field label="Nama"><input className={input} required value={v.nama} onChange={(e) => setV({ ...v, nama: e.target.value })} /></Field>
      <Field label="Jenis">{pilihJenis(v.jenis, (jenis) => setV({ ...v, jenis }))}</Field>
      <Field label="Deskripsi (opsional)"><input className={input} value={v.deskripsi} onChange={(e) => setV({ ...v, deskripsi: e.target.value })} /></Field>
      <PilihGambar awal={null} file={gambar} setFile={setGambar} hapus={false} setHapus={() => {}} />
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

