"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/toast";

export type ApiResult = { ok: boolean; message?: string; fields?: Record<string, string> };

/** POST/PATCH JSON to the admin API, surface the error envelope, refresh server data on success. */
export function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function call(url: string, body?: unknown, method = "POST"): Promise<boolean> {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? "Terjadi kesalahan.");
        setFields(json?.error?.fields ?? {});
        return false;
      }
      router.refresh();
      toast("Perubahan berhasil disimpan.");
      return true;
    } catch {
      setError("Tidak dapat menghubungi server.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { call, busy, error, fields, setError };
}
