import { describe, expect, it } from "vitest";
import { addDays, badgeInfo, ceil1000, hitungPaket, nominalTagihan, periodeDefault, periodsAfter, simulasi, type PaketInfo } from "@/lib/services/tabungan";

const dewi: PaketInfo = { tarif_total: 47_000_000, target_50: 23_500_000, setoran_min_bulanan: 2_000_000, tanggal_milestone: "2027-03-15", perkiraan_hpl: "2027-06-07" };

describe("period helpers", () => {
  it("ceil1000 rounds up to thousands", () => {
    expect(ceil1000(3_524_001)).toBe(3_525_000);
    expect(ceil1000(2_000_000)).toBe(2_000_000);
  });
  it("addDays crosses month and year", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("periodsAfter counts periods whose due day is on/before the limit", () => {
    expect(periodsAfter("2026-11-10", "2027-01-15")).toEqual(["2026-12", "2027-01"]);
    expect(periodsAfter("2026-11-10", "2027-01-09")).toEqual(["2026-12"]);
  });
  it("periodeDefault: this month up to the 10th, otherwise next month", () => {
    expect(periodeDefault("2026-11-10")).toBe("2026-11");
    expect(periodeDefault("2026-11-11")).toBe("2026-12");
    expect(periodeDefault("2026-12-20")).toBe("2027-01");
  });
});

describe("hitungPaket", () => {
  it("computes DP, 50% target and the 28/40 week dates", () => {
    const r = hitungPaket(11_500_000, "2026-01-01");
    expect(r.dp).toBe(2_300_000);
    expect(r.target_50).toBe(5_750_000);
    expect(r.tanggal_milestone).toBe("2026-07-16"); // +196 days
    expect(r.perkiraan_hpl).toBe("2026-10-08"); // +280 days
  });
});

describe("nominalTagihan", () => {
  it("minimum plan always bills the minimum", () => {
    expect(nominalTagihan(dewi, "minimum", "2026-12", 9_400_000, [])).toBe(2_000_000);
  });
  it("suggested plan spreads the gap to 50% over the remaining months (Dewi example)", () => {
    // (23.5M - 9.4M) / 4 periods (Dec, Jan, Feb, Mar) = 3,525,000
    expect(nominalTagihan(dewi, "disarankan", "2026-12", 9_400_000, [])).toBe(3_525_000);
  });
  it("falls back to the minimum when the target is already covered", () => {
    expect(nominalTagihan(dewi, "disarankan", "2026-12", 24_000_000, [])).toBe(2_000_000);
  });
});

describe("badgeInfo", () => {
  it("tercapai when saldo reaches the 50% target", () => {
    expect(badgeInfo(dewi, "minimum", 23_500_000, [], "2026-11-14").badge).toBe("tercapai");
  });
  it("sesuai_jalur when nothing is overdue beyond tolerance", () => {
    const t = [{ periode: "2026-11", nominal: 2_000_000, jatuh_tempo: "2026-11-10", status: "belum_dibayar" as const }];
    expect(badgeInfo(dewi, "minimum", 5_000_000, t, "2026-11-12").badge).toBe("sesuai_jalur"); // 11-10 + 3d = 11-13, not < 11-12
  });
  it("tertinggal when a bill is unpaid past the 3-day tolerance and saldo is below plan", () => {
    const t = [{ periode: "2026-11", nominal: 2_000_000, jatuh_tempo: "2026-11-10", status: "belum_dibayar" as const }];
    const r = badgeInfo(dewi, "minimum", 0, t, "2026-11-14");
    expect(r.badge).toBe("tertinggal");
    expect(r.selisih_rencana).toBe(2_000_000);
  });
});

describe("simulasi", () => {
  // Contract E-03 example: VIP A, Caesar Konvensional, HPHT 2026-09-01, simulated on 2026-11-10.
  const vipA = { tarif_total: 49_000_000, dp: 9_800_000, target_50: 24_500_000, setoran_min_bulanan: 2_000_000, tanggal_milestone: "2027-03-16", perkiraan_hpl: "2027-06-08" };
  it("reproduces the contract example", () => {
    expect(simulasi(vipA, "2026-09-01", "2026-11-10")).toEqual({
      usia_kehamilan_minggu: 10, usia_kehamilan_hari: 0, jumlah_tagihan_sampai_milestone: 4, perkiraan_saldo_milestone: 17_800_000,
      kekurangan_target_50: 6_700_000, target_tercukupi: false, saran_setoran_bulanan: 3_675_000, saran_setoran_setelah_milestone: 12_250_000,
      jumlah_tagihan_setelah_milestone: 2, periode_akhir_milestone: "2027-03", periode_akhir_hpl: "2027-05", jenis_rencana_default: "disarankan",
    });
  });
  it("has no suggestion when the milestone comes before the first monthly bill", () => {
    const r = simulasi({ ...vipA, tanggal_milestone: "2026-11-20", perkiraan_hpl: "2027-02-01" }, "2026-06-01", "2026-11-10");
    expect(r.jumlah_tagihan_sampai_milestone).toBe(0);
    expect(r.saran_setoran_bulanan).toBeNull();
    expect(r.jenis_rencana_default).toBe("minimum");
  });
});
