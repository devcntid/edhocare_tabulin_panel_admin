"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/toast";
import { btnPrimary, btnSecondary, input } from "@/components/ui";
import type { HasilImpor } from "@/lib/services/impor";

/** Two steps: "Periksa file" validates every row without saving; "Impor" saves them only when the file is clean. */
export function ImporForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [hasil, setHasil] = useState<HasilImpor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function kirim(periksa: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const f = new FormData();
    f.set("file", file);
    f.set("periksa", periksa ? "1" : "0");
    try {
      const res = await fetch("/api/impor/pendaftaran", { method: "POST", body: f });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error?.fields?.file ?? json?.error?.message ?? "Gagal memproses file."); setHasil(null); return; }
      setHasil(json.data);
      if (!periksa && json.data.dibuat > 0) {
        toast(`${json.data.dibuat} pendaftaran berhasil diimpor.`);
        router.push("/pendaftaran");
        router.refresh();
      }
    } catch {
      setError("Tidak dapat menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  const bersih = hasil?.periksa && hasil.galat.length === 0;
  return (
    <div className="space-y-5 rounded-2xl border border-[#e1eaf2] bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,text/csv" aria-label="File CSV" className={`${input} max-w-sm`} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setHasil(null); setError(null); }} />
        <a href="/api/impor/pendaftaran/templat" className="text-[13px] font-semibold text-[var(--primary)]" download>Unduh templat CSV</a>
      </div>
      {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} disabled={!file || busy} onClick={() => kirim(true)}>Periksa file</button>
        <button type="button" className={btnPrimary} disabled={!bersih || busy} onClick={() => kirim(false)}>Impor {bersih ? `${hasil.valid} baris` : ""}</button>
      </div>
      {hasil && (
        <div className="space-y-2 text-[13px]" aria-live="polite">
          {hasil.galat.length === 0
            ? <p className="font-semibold text-green-700">{hasil.periksa ? `${hasil.valid} dari ${hasil.jumlah} baris valid. Klik Impor untuk menyimpan.` : "Tidak ada yang diimpor."}</p>
            : <p className="font-semibold text-red-600">{hasil.galat.length} baris bermasalah. Tidak ada yang disimpan. Perbaiki file lalu periksa lagi.</p>}
          {hasil.galat.length > 0 && (
            <table className="w-full border-collapse text-left">
              <thead><tr className="border-b border-[#e1eaf2]"><th className="py-1 pr-3">Baris</th><th className="py-1 pr-3">No. RM</th><th className="py-1">Masalah</th></tr></thead>
              <tbody>{hasil.galat.map((g) => <tr key={`${g.baris}-${g.pesan}`} className="border-b border-[#f0f0f0]"><td className="py-1 pr-3 tabular-nums">{g.baris}</td><td className="py-1 pr-3">{g.no_rm || "-"}</td><td className="py-1">{g.pesan}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
