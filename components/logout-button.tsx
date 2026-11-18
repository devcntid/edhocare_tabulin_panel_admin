"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-[#24323d] hover:bg-[#eef6fb]">
      <LogOut size={16} /> Keluar
    </button>
  );
}
