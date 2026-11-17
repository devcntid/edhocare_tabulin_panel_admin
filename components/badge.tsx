const TONE: Record<string, string> = {
  menunggu_verifikasi: "bg-amber-100 text-amber-800",
  va_disiapkan: "bg-sky-100 text-sky-800",
  aktif: "bg-emerald-100 text-emerald-800",
  selesai: "bg-slate-200 text-slate-700",
  ditolak: "bg-red-100 text-red-800",
  kedaluwarsa: "bg-zinc-200 text-zinc-700",
  belum_dibayar: "bg-amber-100 text-amber-800",
  menunggu_konfirmasi: "bg-sky-100 text-sky-800",
  dikonfirmasi: "bg-emerald-100 text-emerald-800",
  lewat_jatuh_tempo: "bg-red-100 text-red-800",
  lunas: "bg-emerald-100 text-emerald-800",
  sesuai_jalur: "bg-emerald-100 text-emerald-800",
  tertinggal: "bg-red-100 text-red-800",
  tercapai: "bg-teal-100 text-teal-800",
};

export const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function Badge({ value }: { value: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[value] ?? "bg-slate-100 text-slate-700"}`}>{label(value)}</span>;
}
