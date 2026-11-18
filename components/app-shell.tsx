"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckCircle2, ChevronDown, ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { can, PERAN_LABEL } from "@/lib/permissions";
import type { Pengguna } from "@/lib/session";
import type { NotifAdmin } from "@/lib/services/laporan";
import { LogoutButton } from "@/components/logout-button";
import { MENU } from "@/components/nav-menu";
import { ToastHost } from "@/components/toast";

const LABEL = new Map(MENU.flatMap((s) => s.items.map((i) => [i.href, i.label] as const)));
const aktif = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
const inisial = (nama: string) => nama.split(/\s+/).filter(Boolean).slice(0, 2).map((k) => k[0]?.toUpperCase()).join("") || "?";

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

/** `ciut`: icon-only rail on desktop (md and up). The mobile drawer always shows full labels. `lencana`: counts shown on a menu entry. */
function Nav({ user, path, ciut, lencana }: { user: Pengguna; path: string; ciut: boolean; lencana: Record<string, number> }) {
  return (
    <nav aria-label="Menu utama" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {MENU.map((sec) => {
        const items = sec.items.filter((n) => !n.aksi || can(user.peran, n.aksi));
        if (!items.length) return null;
        return (
          <div key={sec.title} className="space-y-0.5">
            <div className={`px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/70 ${ciut ? "md:hidden" : ""}`}>{sec.title}</div>
            {ciut && <div aria-hidden className="mx-2 hidden border-t border-white/15 md:block" />}
            {items.map(({ href, label, icon: Icon }) => {
              const n = lencana[href];
              return (
                <Link key={href} href={href} title={ciut ? label : undefined} aria-current={aktif(path, href) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-semibold transition-colors hover:bg-white/10 ${ciut ? "md:justify-center md:px-0" : ""} ${aktif(path, href) ? "bg-white/20 shadow-[inset_3px_0_0_var(--pink-merek)]" : "text-white/90"}`}>
                  <Icon size={18} className="shrink-0" />
                  <span className={`flex-1 ${ciut ? "md:sr-only" : ""}`}>{label}</span>
                  {n ? <span aria-label={`${n} perlu tindakan`} className={`rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-950 ${ciut ? "md:hidden" : ""}`}>{n}</span> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** Bell with the admin's own to-do notifications (work waiting for them), not the messages sent to participants. */
function BelAdmin({ notif }: { notif: NotifAdmin[] }) {
  const [buka, setBuka] = useState(false);
  const perlu = notif.filter((n) => n.jumlah > 0);
  return (
    <div className="relative">
      <button onClick={() => setBuka((b) => !b)} aria-expanded={buka} aria-haspopup="menu" aria-label={perlu.length ? `Notifikasi admin, ${perlu.length} perlu tindakan` : "Notifikasi admin"} className="relative rounded-xl p-2 text-[#33454f] hover:bg-[#f1f6fa]">
        <Bell size={20} />
        {perlu.length > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--pink-merek)]" />}
      </button>
      {buka && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setBuka(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-[#e1eaf2] bg-white p-2 shadow-lg">
            <div className="px-2 pb-1.5 pt-1 text-xs font-bold uppercase tracking-wide text-[#5b6b78]">Perlu tindakan admin</div>
            {perlu.length === 0 ? (
              <p className="flex items-center gap-2 px-2 py-3 text-[13px] text-[#5b6b78]"><CheckCircle2 size={16} className="text-emerald-600" /> Tidak ada pekerjaan tertunda.</p>
            ) : perlu.map((n) => (
              <Link key={n.kunci} href={n.href} onClick={() => setBuka(false)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-[13px] hover:bg-[#eef6fb]">
                <span>{n.label}</span>
                <span className="rounded-full bg-[var(--pink-merek)] px-2 py-0.5 text-[11px] font-bold text-white">{n.jumlah}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MenuPengguna({ user }: { user: Pengguna }) {
  const [buka, setBuka] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setBuka((b) => !b)} aria-expanded={buka} aria-haspopup="menu" className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-[#f1f6fa]">
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-[13px] font-bold text-white">{inisial(user.nama)}</span>
        <span className="hidden text-left text-[13px] leading-tight sm:block">
          <span className="block font-bold">{user.nama}</span>
          <span className="block text-xs text-[#5b6b78]">{PERAN_LABEL[user.peran]}</span>
        </span>
        <ChevronDown size={16} aria-hidden className="text-[#5b6b78]" />
      </button>
      {buka && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setBuka(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-40 mt-2 w-44 rounded-xl border border-[#e1eaf2] bg-white p-1.5 shadow-lg"><LogoutButton /></div>
        </>
      )}
    </div>
  );
}

export function AppShell({ user, notif = [], children }: { user: Pengguna; notif?: NotifAdmin[]; children: React.ReactNode }) {
  const menunggu = notif.find((n) => n.kunci === "verifikasi")?.jumlah ?? 0;
  const path = usePathname();
  const [buka, setBuka] = useState(false);
  const [ciut, setCiut] = useState(false);
  useEffect(() => setBuka(false), [path]);
  // remembered per browser; read after mount so the server render and first client render match
  useEffect(() => {
    try { setCiut(localStorage.getItem("sidebar-ciut") === "1"); } catch { /* storage blocked: stay expanded */ }
  }, []);
  const ubahCiut = () => {
    setCiut((c) => {
      try { localStorage.setItem("sidebar-ciut", c ? "0" : "1"); } catch { /* not persisted */ }
      return !c;
    });
  };
  const crumbs = jejak(path);

  return (
    <div className="min-h-screen md:flex">
      {buka && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setBuka(false)} aria-hidden />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[var(--primary)] text-white shadow-xl transition-[transform,width] md:sticky md:top-0 md:h-screen md:shrink-0 md:translate-x-0 md:rounded-r-3xl ${ciut ? "md:w-[4.5rem]" : ""} ${buka ? "translate-x-0" : "-translate-x-full"}`}>
        <div className={`flex items-center gap-3 px-4 py-5 ${ciut ? "md:flex-col md:px-0" : ""}`}>
          {/* White plate: the logo's grey wordmark would not read on the blue sidebar. Collapsed rail shows the butterfly mark only. */}
          <Link href="/" aria-label="Tabulin Admin, ke dasbor" className={`flex h-11 min-w-0 flex-1 items-center rounded-xl bg-white px-3 ${ciut ? "md:h-10 md:w-10 md:flex-none md:justify-center md:p-1.5" : ""}`}>
            <Image src="/logo.png" alt="Edelweiss Healthcare Group" width={1578} height={466} priority className={`h-auto max-h-8 w-auto max-w-full object-contain ${ciut ? "md:hidden" : ""}`} />
            <Image src="/logo-mark.png" alt="" aria-hidden width={256} height={256} className={`hidden h-full w-full object-contain ${ciut ? "md:block" : ""}`} />
          </Link>
          <button className="md:hidden" aria-label="Tutup menu" onClick={() => setBuka(false)}><X size={20} /></button>
          <button className="hidden rounded-lg border border-white/30 p-1.5 hover:bg-white/10 md:inline-flex" aria-label={ciut ? "Perluas menu samping" : "Ciutkan menu samping"} aria-expanded={!ciut} onClick={ubahCiut}>
            {ciut ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <Nav user={user} path={path} ciut={ciut} lencana={{ "/pendaftaran": menunggu }} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#e1eaf2] bg-white/95 px-4 backdrop-blur md:px-8">
          <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,var(--biru-merek),var(--accent),var(--pink-merek))]" />
          <button className="md:hidden" aria-label="Buka menu" aria-expanded={buka} onClick={() => setBuka(true)}><Menu size={20} /></button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-[13px] text-[#5b6b78]">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={14} aria-hidden />}
                  {c.href ? <Link href={c.href} className="hover:underline">{c.label}</Link> : <span aria-current="page" className="font-bold text-[#14232e]">{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
          <BelAdmin notif={notif} />
          <MenuPengguna user={user} />
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
      <ToastHost />
    </div>
  );
}
