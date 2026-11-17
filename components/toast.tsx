"use client";
import { useEffect, useState } from "react";

const EVENT = "tabulin:toast";

/** Show a short confirmation. Safe to call from any client code; rendered by <ToastHost> in the app shell. */
export function toast(pesan: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: pesan }));
}

export function ToastHost() {
  const [daftar, setDaftar] = useState<{ id: number; pesan: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onToast = (e: Event) => {
      const id = ++n;
      setDaftar((d) => [...d, { id, pesan: (e as CustomEvent<string>).detail }]);
      const t = setTimeout(() => { setDaftar((d) => d.filter((x) => x.id !== id)); timers.delete(t); }, 4000);
      timers.add(t);
    };
    window.addEventListener(EVENT, onToast);
    return () => { window.removeEventListener(EVENT, onToast); timers.forEach(clearTimeout); };
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {daftar.map((t) => <div key={t.id} className="pointer-events-auto rounded-xl bg-[#1a1a1a] px-4 py-3 text-[13px] font-semibold text-white shadow-lg">{t.pesan}</div>)}
    </div>
  );
}
