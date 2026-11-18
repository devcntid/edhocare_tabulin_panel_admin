"use client";
import { usePathname } from "next/navigation";
import { ikonHalaman } from "@/components/nav-menu";

/** Icon tile in front of a page title; the icon follows the sidebar entry of the current URL. */
export function IkonHalaman() {
  const Ikon = ikonHalaman(usePathname());
  return (
    <span aria-hidden className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e3f1f9] text-[var(--primary)]"><Ikon size={22} /></span>
  );
}
