export const btn = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-40";
export const btnPrimary = `${btn} bg-[var(--primary)] text-white`; // darkened brand blue: 5:1 with white text (exact #2da5dd is only 2.8:1)
export const btnSecondary = `${btn} border border-[#ddd] bg-white text-[#333]`;
export const btnDanger = `${btn} bg-red-600 text-white`;
export const input = "h-10 w-full px-3 text-[13px]";
export const card = "rounded-2xl border border-[#e5e7eb] bg-white p-5";
/** Wording for items that are shown / hidden in the customer app (instead of Aktif / Nonaktif). */
export const TAMPIL = ["Tampil", "Tersembunyi"] as const;
