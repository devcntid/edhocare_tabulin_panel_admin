export const btn = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold transition-colors disabled:opacity-40";
export const btnPrimary = `${btn} bg-[var(--primary)] text-white shadow-sm hover:bg-[#15658b]`; // darkened brand blue: 5:1 with white text (exact #2da5dd is only 2.8:1)
export const btnSecondary = `${btn} border border-[#cfdde8] bg-white text-[#24323d] hover:bg-[#f1f6fa]`;
export const btnDanger = `${btn} bg-red-600 text-white`;
export const input = "h-10 w-full px-3 text-[13px]";
export const card = "rounded-2xl border border-[#e1eaf2] bg-white p-5 shadow-[0_1px_3px_rgba(16,64,96,0.06)]";
/** Wording for items that are shown / hidden in the customer app (instead of Aktif / Nonaktif). */
export const TAMPIL = ["Tampil", "Tersembunyi"] as const;
/** Small row button next to a table row (Detail, Ubah, ...). Defined here so server components can use it too. */
export const btnBaris = "inline-flex items-center rounded-lg border border-[#9cc3da] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[#eef6fb] disabled:opacity-40";
