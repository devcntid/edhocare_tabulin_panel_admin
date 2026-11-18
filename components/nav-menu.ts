import { Baby, BedDouble, Bell, Building2, CalendarClock, ClipboardList, CreditCard, FileText, History, LayoutDashboard, ListChecks, Plug, ReceiptText, Settings, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";

export type ItemMenu = { href: string; label: string; icon: LucideIcon; aksi?: "kelola_pengguna" };
export const MENU: { title: string; items: ItemMenu[] }[] = [
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


const IKON = new Map(MENU.flatMap((s) => s.items.map((i) => [i.href, i.icon] as const)));
/** Icon of the menu entry that owns `path` (first path segment), for page titles. */
export const ikonHalaman = (path: string) => IKON.get("/" + (path.split("/").filter(Boolean)[0] ?? "")) ?? LayoutDashboard;
