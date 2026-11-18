"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { input } from "@/components/ui";

export type OpsiCari = { value: string; label: string; sub?: string; disabled?: boolean; alasan?: string };

/** Searchable select (combobox): one field; type to filter, arrow keys + Enter or click to choose, Esc to close. */
export function SelectCari({ opsi, value, onChange, placeholder = "Pilih…", kosong = "Tidak ada yang cocok", ariaLabel }: {
  opsi: OpsiCari[]; value: string; onChange: (v: string) => void; placeholder?: string; kosong?: string; ariaLabel?: string;
}) {
  const id = useId();
  const dipilih = opsi.find((o) => o.value === value);
  const [buka, setBuka] = useState(false);
  const [teks, setTeks] = useState("");
  const [aktif, setAktif] = useState(0);
  const kotak = useRef<HTMLDivElement>(null);

  const hasil = useMemo(() => {
    const k = teks.trim().toLowerCase();
    return opsi.filter((o) => !k || `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(k));
  }, [opsi, teks]);

  useEffect(() => {
    if (!buka) return;
    const klikLuar = (e: MouseEvent) => { if (!kotak.current?.contains(e.target as Node)) setBuka(false); };
    document.addEventListener("mousedown", klikLuar);
    return () => document.removeEventListener("mousedown", klikLuar);
  }, [buka]);

  function pilih(o: OpsiCari) {
    if (o.disabled) return;
    onChange(o.value);
    setBuka(false);
    setTeks("");
  }

  function tombol(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setBuka(true); setAktif((a) => Math.min(a + 1, hasil.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAktif((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && buka) { e.preventDefault(); if (hasil[aktif]) pilih(hasil[aktif]); }
    else if (e.key === "Escape") { setBuka(false); setTeks(""); }
  }

  return (
    <div ref={kotak} className="relative font-normal">
      <input
        role="combobox" aria-expanded={buka} aria-controls={`${id}-daftar`} aria-autocomplete="list" aria-label={ariaLabel}
        className={`${input} pr-16`} autoComplete="off"
        placeholder={dipilih ? dipilih.label : placeholder}
        value={buka ? teks : dipilih ? dipilih.label : ""}
        onFocus={() => { setBuka(true); setAktif(0); }}
        onChange={(e) => { setTeks(e.target.value); setBuka(true); setAktif(0); }}
        onKeyDown={tombol}
      />
      {value && (
        <button type="button" aria-label="Hapus pilihan" className="absolute right-8 top-1/2 -translate-y-1/2 px-1 text-[#888] hover:text-[#333]" onClick={() => { onChange(""); setTeks(""); }}>×</button>
      )}
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#888]">▾</span>
      {buka && (
        <ul id={`${id}-daftar`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#cfdde8] bg-white py-1 shadow-lg">
          {hasil.length === 0 && <li className="px-3 py-2 text-[13px] text-[#888]">{kosong}</li>}
          {hasil.map((o, i) => (
            <li
              key={o.value} role="option" aria-selected={o.value === value} aria-disabled={o.disabled}
              className={`flex items-baseline justify-between gap-3 px-3 py-2 text-[13px] ${o.disabled ? "cursor-not-allowed text-[#aaa]" : "cursor-pointer"} ${i === aktif && !o.disabled ? "bg-[#eef3f1]" : ""} ${o.value === value ? "font-semibold" : ""}`}
              onMouseEnter={() => setAktif(i)} onMouseDown={(e) => { e.preventDefault(); pilih(o); }}
            >
              <span>{o.label}{o.disabled && o.alasan && <span className="ml-2 text-xs">({o.alasan})</span>}</span>
              {o.sub && <span className="text-xs text-[#888]">{o.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
