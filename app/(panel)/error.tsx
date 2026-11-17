"use client";
import { btnPrimary } from "@/components/ui";

export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-6 text-center">
      <h1 className="text-lg font-bold">Terjadi kesalahan</h1>
      <p className="text-[13px] text-[#666]">Halaman tidak dapat dimuat. Coba lagi; jika berulang, hubungi pengembang.</p>
      <button className={btnPrimary} onClick={reset}>Coba lagi</button>
    </div>
  );
}
