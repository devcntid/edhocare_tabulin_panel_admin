// Pure savings rules extracted from the mockup's demo server (docs/05 §3-§6). No I/O.

export const DAY_MS = 86_400_000;

export type Rencana = "minimum" | "disarankan";
export type PaketInfo = { tarif_total: number; target_50: number; setoran_min_bulanan: number; tanggal_milestone: string; perkiraan_hpl: string };
export type TagihanLite = { periode: string; nominal: number; jatuh_tempo: string; status: "belum_dibayar" | "lunas" | "menunggu_konfirmasi" };

export const ceil1000 = (x: number) => Math.ceil(x / 1000) * 1000;

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);

export const periodeOf = (date: string) => date.slice(0, 7);

export function nextPeriode(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Periods strictly after `from`'s month whose due day (`hari`) falls on or before `until`. */
export function periodsAfter(from: string, until: string, hari = 10): string[] {
  const out: string[] = [];
  let p = nextPeriode(periodeOf(from));
  const d = String(hari).padStart(2, "0");
  while (`${p}-${d}` <= until) {
    out.push(p);
    p = nextPeriode(p);
  }
  return out;
}

/** Period for "Terbitkan tagihan": this month up to the due day, else next month. */
export function periodeDefault(today: string, hari = 10): string {
  return Number(today.slice(8, 10)) <= hari ? periodeOf(today) : nextPeriode(periodeOf(today));
}

/** Monthly bill nominal (D-02). */
export function nominalTagihan(
  p: PaketInfo, rencana: Rencana, periode: string, saldo: number, tagihan: TagihanLite[], hari = 10,
): number {
  const min = p.setoran_min_bulanan;
  if (rencana !== "disarankan") return min;
  const d = String(hari).padStart(2, "0");
  const fase1 = `${periode}-${d}` <= p.tanggal_milestone;
  const goal = fase1 ? p.target_50 : p.tarif_total;
  const end = fase1 ? p.tanggal_milestone : p.perkiraan_hpl;
  const sisaPer = 1 + periodsAfter(`${periode}-01`, end, hari).length;
  const tertutup = saldo + tagihan.filter((t) => t.status !== "lunas" && t.periode !== periode).reduce((s, t) => s + t.nominal, 0);
  const kurang = goal - tertutup;
  return kurang <= 0 ? min : Math.max(min, ceil1000(kurang / sisaPer));
}

export type Badge = "sesuai_jalur" | "tertinggal" | "tercapai";

/** Savings status badge and projections (D-03). Only meaningful for `aktif` registrations. */
export function badgeInfo(
  p: PaketInfo, rencana: Rencana, saldo: number, tagihan: TagihanLite[], today: string, hari = 10, toleransi = 3,
) {
  const sisa_ke_target_50 = Math.max(0, p.target_50 - saldo);
  const belum = tagihan.filter((t) => t.status !== "lunas");
  let proyeksi = saldo + belum.filter((t) => `${t.periode}-${String(hari).padStart(2, "0")}` <= p.tanggal_milestone).reduce((s, t) => s + t.nominal, 0);
  const ada = new Set(tagihan.map((t) => t.periode));
  const futurePer = periodsAfter(today, p.tanggal_milestone, hari).filter((per) => !ada.has(per));
  for (const per of futurePer) proyeksi += nominalTagihan(p, rencana, per, saldo, tagihan, hari);
  const proyeksi_kekurangan_milestone = Math.max(0, p.target_50 - proyeksi);
  // A bill with a reported transfer awaiting confirmation does not count against the patient (D-03).
  const rencana_kumulatif = tagihan.filter((t) => addDays(t.jatuh_tempo, toleransi) < today && t.status !== "menunggu_konfirmasi").reduce((s, t) => s + t.nominal, 0);
  const selisih_rencana = Math.max(0, rencana_kumulatif - saldo);
  const badge: Badge = saldo >= p.target_50 ? "tercapai" : saldo < rencana_kumulatif ? "tertinggal" : "sesuai_jalur";
  return { badge, sisa_ke_target_50, proyeksi_saldo_milestone: proyeksi, proyeksi_kekurangan_milestone, rencana_kumulatif, selisih_rencana };
}

/** Package numbers from tariff + HPHT. */
export function hitungPaket(tarif_total: number, hpht: string, dpPersen = 20, targetPersen = 50, milestoneMinggu = 28, hplMinggu = 40) {
  return {
    dp: Math.round((tarif_total * dpPersen) / 100),
    target_50: Math.round((tarif_total * targetPersen) / 100),
    tanggal_milestone: addDays(hpht, milestoneMinggu * 7),
    perkiraan_hpl: addDays(hpht, hplMinggu * 7),
  };
}

export type PaketSimulasi = { tarif_total: number; dp: number; target_50: number; setoran_min_bulanan: number; tanggal_milestone: string; perkiraan_hpl: string };

/** Server-side simulation (docs/05 §4, contract §3.4): projected balance at the milestone and the suggested deposits. */
export function simulasi(p: PaketSimulasi, hpht: string, today: string, hari = 10) {
  const min = p.setoran_min_bulanan;
  const sampai = periodsAfter(today, p.tanggal_milestone, hari);
  const setelah = periodsAfter(p.tanggal_milestone, p.perkiraan_hpl, hari);
  const n = sampai.length;
  const perkiraan_saldo_milestone = p.dp + n * min;
  const kekurangan_target_50 = Math.max(0, p.target_50 - perkiraan_saldo_milestone);
  const target_tercukupi = kekurangan_target_50 === 0;
  const saran_setoran_bulanan = n > 0 ? Math.max(min, ceil1000((p.target_50 - p.dp) / n)) : null;
  const saldoSaran = n > 0 ? p.dp + n * (saran_setoran_bulanan as number) : p.dp;
  const sisa100 = Math.max(0, p.tarif_total - Math.max(saldoSaran, p.dp));
  const saran_setoran_setelah_milestone = setelah.length ? (sisa100 > 0 ? Math.max(min, ceil1000(sisa100 / setelah.length)) : 0) : null;
  const hari_usia = daysBetween(hpht, today);
  return {
    usia_kehamilan_minggu: Math.floor(hari_usia / 7),
    usia_kehamilan_hari: hari_usia % 7,
    jumlah_tagihan_sampai_milestone: n,
    perkiraan_saldo_milestone,
    kekurangan_target_50,
    target_tercukupi,
    saran_setoran_bulanan,
    saran_setoran_setelah_milestone,
    jumlah_tagihan_setelah_milestone: setelah.length,
    periode_akhir_milestone: sampai.at(-1) ?? null,
    periode_akhir_hpl: [...sampai, ...setelah].at(-1) ?? null,
    jenis_rencana_default: !target_tercukupi && saran_setoran_bulanan !== null && saran_setoran_bulanan !== min ? ("disarankan" as const) : ("minimum" as const),
  };
}
