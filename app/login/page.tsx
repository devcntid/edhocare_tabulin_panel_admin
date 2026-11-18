import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
        <Image src="/logo.png" alt="Edelweiss Healthcare Group" width={1578} height={466} priority className="mb-5 h-auto w-48" />
        <h1 className="text-2xl font-bold text-[#14232e]">Tabulin Admin</h1>
        <p className="mb-6 mt-1 text-[13px] text-[#5b6b78]">Masuk untuk mengelola Tabungan Ibu Bersalin.</p>
        <LoginForm />
      </div>
    </main>
  );
}
