import { describe, expect, it } from "vitest";
import { nomorHalaman } from "@/components/table";
import { PAGE_SIZE, perValid } from "@/lib/paging";

describe("pagination helpers", () => {
  it("shows every page when there are few, and gaps when there are many", () => {
    expect(nomorHalaman(1, 1)).toEqual([1]);
    expect(nomorHalaman(2, 4)).toEqual([1, 2, 3, 4]);
    expect(nomorHalaman(1, 10)).toEqual([1, 2, null, 10]);
    expect(nomorHalaman(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(nomorHalaman(10, 10)).toEqual([1, null, 9, 10]);
    expect(nomorHalaman(3, 10)).toEqual([1, 2, 3, 4, null, 10]);
  });

  it("accepts only the allowed rows-per-page and falls back to the default", () => {
    expect([10, 15, 25, 50].map(perValid)).toEqual([10, 15, 25, 50]);
    for (const x of [undefined, 0, -5, 7, 1000, Number.NaN]) expect(perValid(x)).toBe(PAGE_SIZE);
  });
});
