import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-6">
        <h1 className="text-xl font-bold text-[var(--primary)]">Tabulin Admin</h1>
        <p className="mb-5 mt-1 text-[13px] text-[#666]">Masuk untuk mengelola Tabungan Ibu Bersalin.</p>
        <LoginForm />
      </div>
    </main>
  );
}
