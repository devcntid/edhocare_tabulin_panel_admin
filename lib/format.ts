export const fmtAngka = (n: number) => new Intl.NumberFormat("id-ID").format(n);

export const fmtRp = (n: number | null | undefined) => (n == null ? "-" : "Rp " + fmtAngka(n));

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** 'YYYY-MM-DD' (or ISO timestamp) -> '10 Nov 2026'. Date-only strings are not passed through Date to avoid day shifts. */
export function fmtTgl(v: string | Date | null | undefined) {
  if (!v) return "-";
  const s = typeof v === "string" ? v : v.toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${Number(s.slice(8, 10))} ${BULAN[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  const d = new Date(s);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
}
