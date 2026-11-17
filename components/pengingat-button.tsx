"use client";
import { ConfirmButton } from "@/components/confirm-button";
import { useApi } from "@/components/use-api";

export function PengingatButton({ id, nomor, lewat }: { id: number; nomor: string; lewat: boolean }) {
  const api = useApi();
  return (
    <ConfirmButton
      galat={api.error} className="text-xs font-semibold text-[var(--primary)]" label="Kirim pengingat" confirmLabel="Kirim pengingat"
      title={`Kirim pengingat untuk ${nomor}?`}
      message={lewat ? "Tagihan sudah lewat jatuh tempo: dikirim templat 'Tagihan terlambat' (pengiriman tiruan, tercatat di log notifikasi)." : "Dikirim templat 'Pengingat jatuh tempo' (pengiriman tiruan, tercatat di log notifikasi)."}
      onConfirm={() => api.call(`/api/tagihan/${id}/pengingat`)}
    />
  );
}
