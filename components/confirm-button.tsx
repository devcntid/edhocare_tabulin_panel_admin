"use client";
import { useEffect, useRef, useState } from "react";
import { btnDanger, btnPrimary, btnSecondary, input } from "@/components/ui";

type Props = {
  label: React.ReactNode;
  className?: string;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Ask for a text value (reason, new password…) before confirming. */
  inputLabel?: string;
  inputType?: "text" | "password";
  onConfirm: (value: string) => Promise<boolean | void>;
  disabled?: boolean;
  /** Error from the last attempt (e.g. useApi().error), shown inside the dialog. */
  galat?: string | null;
};

/** Button + accessible confirmation dialog (replaces window.confirm/prompt). Stays open and shows the error if the action fails. */
export function ConfirmButton({ label, className, title, message, confirmLabel = "Ya, lanjutkan", danger, inputLabel, inputType = "text", onConfirm, disabled, galat }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function go() {
    setBusy(true);
    const ok = await onConfirm(value.trim());
    setBusy(false);
    if (ok !== false) { setOpen(false); setValue(""); }
  }

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md space-y-3 whitespace-normal rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold">{title}</h2>
            {message && <p className="text-[13px] text-[#555]">{message}</p>}
            {inputLabel && (
              <label className="block text-[13px] font-semibold">{inputLabel}
                <input className={`${input} mt-1`} type={inputType} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
            )}
            {galat && <p role="alert" className="text-[13px] text-red-600">{galat}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnSecondary} disabled={busy} onClick={() => setOpen(false)}>Batal</button>
              <button type="button" className={danger ? btnDanger : btnPrimary} disabled={busy || (!!inputLabel && !value.trim())} onClick={go}>{busy ? "Memproses…" : confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
