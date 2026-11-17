"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton({ dark }: { dark?: boolean }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold ${dark ? "border border-[#ddd] bg-white text-[#333]" : "hover:bg-white/15"}`}>
      <LogOut size={16} /> Keluar
    </button>
  );
}
