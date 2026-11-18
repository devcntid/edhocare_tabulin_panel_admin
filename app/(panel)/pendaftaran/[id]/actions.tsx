"use client";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { KonfirmasiSetoran, type TagihanTerbuka } from "@/components/konfirmasi-setoran";
import { btnDanger, btnPrimary, btnSecondary, card, input } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { fmtRp } from "@/lib/format";

type Props = {
  id: number;
  status: string;
  bisaVerifikasi: boolean;
  bisaKeuangan: boolean;
  tagihanBaru: { periode: string; nominal: number } | null;
  /** Unpaid bills the deposit can settle, and the latest allowed transfer date (yesterday, H+1). */
  tagihanBelumLunas: TagihanTerbuka[];
  tanggalMaks: string;
};


export function Actions({ id, status, bisaVerifikasi, bisaKeuangan, tagihanBaru, tagihanBelumLunas, tanggalMaks }: Props) {
  const api = useApi();
  const [alasan, setAlasan] = useState("");
  const [tolak, setTolak] = useState(false);
  const [noVa, setNoVa] = useState("");
    const base = `/api/pendaftaran/${id}`;

  const tampil = (status === "menunggu_verifikasi" && bisaVerifikasi) || (["va_disiapkan", "aktif"].includes(status) && bisaKeuangan);
  if (!tampil) return null;

  return (
    <section className={`${card} space-y-4`}>
      <h2 className="font-bold">Aksi</h2>

      {status === "menunggu_verifikasi" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={api.busy} onClick={() => api.call(`${base}/setujui`)}>Setujui</button>
            <button className={btnSecondary} disabled={api.busy} onClick={() => setTolak(!tolak)}>Tolak…</button>
            <ConfirmButton galat={api.error} className={btnSecondary} label="Tandai kedaluwarsa" title="Tandai pendaftaran kedaluwarsa?" message="Pendaftaran tidak dapat diproses lagi. Pasien perlu mendaftar ulang." confirmLabel="Tandai kedaluwarsa" onConfirm={() => api.call(`${base}/kedaluwarsa`)} />
          </div>
          {tolak && (
            <div className="space-y-2">
              <textarea className="w-full p-3 text-[13px]" rows={2} placeholder="Alasan penolakan (wajib)" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
              <button className={btnDanger} disabled={api.busy || !alasan.trim()} onClick={() => api.call(`${base}/tolak`, { alasan })}>Kirim penolakan</button>
            </div>
          )}
        </div>
      )}

      {status === "va_disiapkan" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[13px] font-semibold">No. VA (kosongkan untuk dibuat otomatis)
            <input className={`${input} mt-1 w-72`} inputMode="numeric" value={noVa} onChange={(e) => setNoVa(e.target.value)} placeholder="16 digit" />
          </label>
          <button className={btnPrimary} disabled={api.busy} onClick={() => api.call(`${base}/pasang-va`, { no_va: noVa })}>Pasang VA & terbitkan tagihan DP</button>
        </div>
      )}

      {status === "aktif" && (
        <div className="space-y-5">
          <p className="text-[13px] text-[#666]">Setoran dari bank atau gateway masuk otomatis ke buku besar. Untuk transfer bank manual yang sudah dicek di mutasi, konfirmasi dengan tombol di bawah. Kesalahan dikoreksi lewat baris koreksi.</p>

          <div className="flex flex-wrap items-center gap-3 border-t border-[#eee] pt-4">
            <KonfirmasiSetoran id={id} tagihan={tagihanBelumLunas} tanggalMaks={tanggalMaks} />
            {tagihanBaru && (
              <button className={btnSecondary} disabled={api.busy} onClick={() => api.call(`${base}/tagihan`, { periode: tagihanBaru.periode })}>
                Terbitkan tagihan {tagihanBaru.periode} ({fmtRp(tagihanBaru.nominal)})
              </button>
            )}
            <ConfirmButton galat={api.error} className={btnSecondary} label="Tandai selesai" title="Tandai pendaftaran selesai?" message="Saldo dianggap sudah dipakai di kasir. Setelah selesai, tidak ada setoran atau koreksi lagi." confirmLabel="Tandai selesai" onConfirm={() => api.call(`${base}/selesai`)} />
          </div>
        </div>
      )}

      {api.error && <p role="alert" className="text-[13px] text-red-600">{api.error}{Object.values(api.fields).length > 0 && `: ${Object.values(api.fields).join(", ")}`}</p>}
    </section>
  );
}

export function KoreksiButton({ id, nomor }: { id: number; nomor: string }) {
  const api = useApi();
  return (
    <ConfirmButton
      galat={api.error} className="text-xs font-semibold text-red-600" label="Koreksi" danger confirmLabel="Koreksi setoran"
      title={`Koreksi setoran ${nomor}?`} message="Dibuat baris koreksi bernilai negatif; baris asli tidak diubah. Jika setoran ini melunasi tagihan, tagihan dibuka kembali."
      inputLabel="Alasan koreksi (wajib)" onConfirm={(alasan) => api.call(`/api/transaksi/${id}/koreksi`, { alasan })}
    />
  );
}

export function TolakKlaimButton({ id, nomor }: { id: number; nomor: string }) {
  const api = useApi();
  return (
    <ConfirmButton
      galat={api.error} className="text-xs font-semibold text-red-600" label="Tolak" danger confirmLabel="Tolak laporan"
      title={`Tolak laporan transfer ${nomor}?`} message="Pasien diberi tahu bahwa laporan belum dapat dikonfirmasi. Tagihan kembali berstatus belum dibayar."
      inputLabel="Alasan penolakan (wajib)" onConfirm={(alasan) => api.call(`/api/klaim/${id}/tolak`, { alasan })}
    />
  );
}
