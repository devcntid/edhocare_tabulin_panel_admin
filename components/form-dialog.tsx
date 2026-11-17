"use client";
import { useEffect, useRef, useState } from "react";
import { fmtAngka } from "@/lib/format";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

type Props = {
  /** Text of the button that opens the dialog. */
  tombol: React.ReactNode;
  /** "utama" = primary button (tambah), "baris" = small row button (ubah). */
  gaya?: "utama" | "baris";
  judul: string;
  desc?: string;
  simpan?: string;
  galat?: string | null;
  busy?: boolean;
  /** Return true when saved; the dialog then closes. */
  onSubmit: () => Promise<boolean>;
  /** Called whenever the dialog closes without saving, so the caller can reset its fields. */
  onBatal?: () => void;
  children: React.ReactNode;
};

/** Standard modal form for create/edit. Fields go in as children (use <Field>). Esc and Batal close it without saving. */
export function FormDialog({ tombol, gaya = "utama", judul, desc, simpan = "Simpan", galat, busy, onSubmit, onBatal, children }: Props) {
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const batalRef = useRef(onBatal);
  batalRef.current = onBatal;

  const tutup = () => { setBuka(false); onBatal?.(); };

  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && (setBuka(false), batalRef.current?.());
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [buka, busy]);

  return (
    <>
      <button type="button" className={gaya === "utama" ? btnPrimary : "rounded-lg border border-[#ddd] bg-white px-3 py-1.5 text-xs font-semibold text-[#333] hover:bg-[#f4f6f7]"} onClick={() => setBuka(true)}>{tombol}</button>
      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && tutup()}>
          <form
            ref={ref}
            role="dialog" aria-modal="true" aria-label={judul}
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onSubmit={async (e) => { e.preventDefault(); if (await onSubmit()) setBuka(false); }}
          >
            <div className="border-b border-[#eee] px-6 py-4">
              <h2 className="text-base font-bold">{judul}</h2>
              {desc && <p className="mt-0.5 text-[13px] text-[#666]">{desc}</p>}
            </div>
            <div className="grid gap-4 px-6 py-5">
              {children}
              {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{galat}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#eee] px-6 py-4">
              <button type="button" className={btnSecondary} disabled={busy} onClick={tutup}>Batal</button>
              <button className={btnPrimary} disabled={busy}>{busy ? "Menyimpan…" : simpan}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Labelled form field with optional hint. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[13px] font-semibold">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-[#777]">{hint}</span>}
    </label>
  );
}

/** Rupiah input: "Rp" pinned left, digits only. */
export function InputRp({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <span className="relative block">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-normal text-[#777]">Rp</span>
      <input {...rest} className={`${input} pl-9 text-right font-normal tabular-nums`} inputMode="numeric" value={value ? fmtAngka(Number(value)) : ""} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
    </span>
  );
}

/** Active / inactive label (text + dot, never colour only). `kata` overrides the wording, e.g. ["Tampil", "Tersembunyi"]. */
export function StatusAktif({ aktif, kata = ["Aktif", "Nonaktif"] }: { aktif: boolean; kata?: readonly [string, string] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${aktif ? "text-emerald-700" : "text-[#888]"}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${aktif ? "bg-emerald-500" : "bg-[#bbb]"}`} />{aktif ? kata[0] : kata[1]}
    </span>
  );
}

/** Row-button class for plain actions next to <FormDialog gaya="baris">. */
export const btnBaris = "rounded-lg border border-[#ddd] bg-white px-3 py-1.5 text-xs font-semibold text-[#333] hover:bg-[#f4f6f7] disabled:opacity-40";

/** Action cell: buttons side by side, right-aligned, never wrapped. */
export function AksiBaris({ children }: { children: React.ReactNode }) {
  return <td className="w-px whitespace-nowrap"><div className="flex items-center justify-end gap-2">{children}</div></td>;
}
