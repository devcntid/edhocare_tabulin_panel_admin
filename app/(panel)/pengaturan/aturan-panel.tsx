"use client";
import { useState } from "react";
import { input } from "@/components/ui";
import { useApi } from "@/components/use-api";

const digits = (v: string) => v.replace(/\D/g, "");

export function AturanBaris({ kunci, nama, nilai, satuan, ket, bisaKelola }: { kunci: string; nama: string; nilai: number; satuan: string; ket: string; bisaKelola: boolean }) {
  const api = useApi();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(String(nilai));
  const err = api.error ? `${api.error} ${Object.values(api.fields).join(", ")}` : null;
  return (
    <>
      <tr>
        <td>{nama}</td>
        <td className="whitespace-nowrap text-right font-semibold tabular-nums">
          {edit ? <input className={`${input} h-8 w-20 text-right`} inputMode="numeric" aria-label={nama} value={v} onChange={(e) => setV(digits(e.target.value))} /> : nilai}
        </td>
        <td className="whitespace-nowrap">{satuan}</td>
        <td className="text-[#666]">{ket}</td>
        {bisaKelola && (
          <td className="whitespace-nowrap">
            {edit ? (
              <span className="flex gap-3">
                <button className="text-xs font-semibold text-[var(--primary)] disabled:opacity-40" disabled={api.busy || v === ""}
                  onClick={async () => { if (await api.call(`/api/konfigurasi/${kunci}`, { nilai: Number(v) }, "PATCH")) setEdit(false); }}>Simpan</button>
                <button className="text-xs" onClick={() => { setEdit(false); setV(String(nilai)); }}>Batal</button>
              </span>
            ) : (
              <button className="text-xs font-semibold text-[var(--primary)]" onClick={() => { setV(String(nilai)); setEdit(true); }}>Ubah</button>
            )}
          </td>
        )}
      </tr>
      {err && <tr><td colSpan={5} role="alert" className="text-xs text-red-600">{err}</td></tr>}
    </>
  );
}
