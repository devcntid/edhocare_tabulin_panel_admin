"use client";
import { useRouter } from "next/navigation";
import { PER_HALAMAN } from "@/lib/paging";

/** Rows-per-page select. Changing it returns to page 1 and keeps the current search and filters. */
export function PerHalaman({ basis, params, per, awalan, jangkar }: { basis: string; params: Record<string, string>; per: number; awalan?: string; jangkar?: string }) {
  const kPage = awalan ? `${awalan}_page` : "page";
  const kPer = awalan ? `${awalan}_per` : "per";
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      Baris per halaman
      <select
        className="h-9 px-2 text-[13px]" value={per}
        onChange={(e) => {
          const q = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== kPage && k !== kPer));
          q.set(kPer, e.target.value);
          router.push(`${basis}?${q}${jangkar ? `#${jangkar}` : ""}`);
        }}
      >
        {PER_HALAMAN.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
