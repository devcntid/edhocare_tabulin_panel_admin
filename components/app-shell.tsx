"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Baby, BedDouble, Building2, Bell, CalendarClock, ChevronRight, ClipboardList, CreditCard, FileText, History, LayoutDashboard, ListChecks, Menu, Plug, ReceiptText, Settings, UserRound, Users, Wallet, X } from "lucide-react";
import { can, PERAN_LABEL } from "@/lib/permissions";
import type { Pengguna } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";
import { ToastHost } from "@/components/toast";

type Item = { href: string; label: string; icon: typeof Bell; aksi?: "kelola_pengguna" };
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "Ringkasan", items: [{ href: "/", label: "Dasbor", icon: LayoutDashboard }] },
  {
    title: "Program",
    items: [
      { href: "/pasien", label: "Pasien", icon: UserRound },
      { href: "/pendaftaran", label: "Pendaftaran", icon: ClipboardList },
      { href: "/notifikasi", label: "Notifikasi", icon: Bell },
      { href: "/templat", label: "Templat notifikasi", icon: FileText },
    ],
  },
  {
    title: "Keuangan",
    items: [
      { href: "/tagihan", label: "Tagihan", icon: ReceiptText },
      { href: "/jadwal-cicilan", label: "Jadwal cicilan", icon: CalendarClock },
      { href: "/setoran", label: "Setoran", icon: Wallet },
      { href: "/log-api", label: "Log setoran API", icon: Plug },
      { href: "/pembayaran", label: "Metode pembayaran", icon: CreditCard },
      { href: "/instruksi-pembayaran", label: "Instruksi pembayaran", icon: ListChecks },
    ],
  },
  {
    title: "Data master",
    items: [
      { href: "/cara-persalinan", label: "Cara persalinan", icon: Baby },
      { href: "/kelas-kamar", label: "Kelas kamar", icon: BedDouble },
      { href: "/faskes", label: "Faskes", icon: Building2 },
    ],
  },
  {
    title: "Sistem",
    items: [
      { href: "/pengaturan", label: "Pengaturan", icon: Settings },
      { href: "/audit", label: "Audit log", icon: History },
      { href: "/pengguna", label: "Pengguna", icon: Users, aksi: "kelola_pengguna" },
    ],
  },
];

const LABEL = new Map(SECTIONS.flatMap((s) => s.items.map((i) => [i.href, i.label] as const)));
const aktif = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** Breadcrumb from the URL: Dasbor / <menu> / <detail>. */
function jejak(path: string): { label: string; href?: string }[] {
  const seg = path.split("/").filter(Boolean);
  if (!seg.length) return [{ label: "Dasbor" }];
  const out: { label: string; href?: string }[] = [{ label: "Dasbor", href: "/" }];
  const induk = "/" + seg[0];
  out.push({ label: LABEL.get(induk) ?? seg[0], href: seg.length > 1 ? induk : undefined });
  if (seg.length > 1) out.push({ label: seg[1] === "baru" ? "Baru" : decodeURIComponent(seg[1]).replace(/^(\d+)$/, "#$1") });
  return out;
}

function Nav({ user, path }: { user: Pengguna; path: string }) {
  return (
    <nav aria-label="Menu utama" className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
      {SECTIONS.map((sec) => {
        const items = sec.items.filter((n) => !n.aksi || can(user.peran, n.aksi));
        if (!items.length) return null;
        return (
          <div key={sec.title} className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">{sec.title}</div>
            {items.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} aria-current={aktif(path, href) ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold hover:bg-white/15 ${aktif(path, href) ? "bg-white/20" : ""}`}>
                <Icon size={16} /> {label}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ user, children }: { user: Pengguna; children: React.ReactNode }) {
  const path = usePathname();
  const [buka, setBuka] = useState(false);
  useEffect(() => setBuka(false), [path]);
  const crumbs = jejak(path);

  return (
    <div className="min-h-screen md:flex">
      {buka && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setBuka(false)} aria-hidden />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-[var(--primary)] text-white transition-transform md:sticky md:top-0 md:h-screen md:shrink-0 md:translate-x-0 ${buka ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="text-lg font-bold">Tabulin Admin</div>
          <button className="md:hidden" aria-label="Tutup menu" onClick={() => setBuka(false)}><X size={20} /></button>
        </div>
        <Nav user={user} path={path} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 md:px-6">
          <button className="md:hidden" aria-label="Buka menu" aria-expanded={buka} onClick={() => setBuka(true)}><Menu size={20} /></button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-[13px] text-[#666]">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={14} aria-hidden />}
                  {c.href ? <Link href={c.href} className="hover:underline">{c.label}</Link> : <span aria-current="page" className="font-semibold text-[#1a1a1a]">{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
          <div className="hidden text-right text-[13px] leading-tight sm:block">
            <div className="font-semibold">{user.nama}</div>
            <div className="text-xs text-[#666]">{PERAN_LABEL[user.peran]}</div>
          </div>
          <div className="w-28"><LogoutButton dark /></div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
      <ToastHost />
    </div>
  );
}
