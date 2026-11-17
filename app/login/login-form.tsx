"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (res.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    const json = await res.json().catch(() => ({}));
    setError(json?.error?.message ?? "Gagal masuk.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-[13px] font-semibold">Email
        <input className={`${input} mt-1`} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-[13px] font-semibold">Password
        <input className={`${input} mt-1`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
      <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "Memproses…" : "Masuk"}</button>
    </form>
  );
}
