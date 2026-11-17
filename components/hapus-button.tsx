"use client";
import { ConfirmButton } from "@/components/confirm-button";
import { useApi } from "@/components/use-api";

/** Delete button. Only data that nothing refers to can be deleted; otherwise the button is disabled and explains why. */
export function HapusButton({ entitas, refId, nama, dipakai, diri }: { entitas: string; refId: string | number; nama: string; dipakai: number; diri?: boolean }) {
  const api = useApi();
  const cls = "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white";
  if (dipakai > 0 || diri) {
    return <button type="button" disabled className={cls} title={diri ? "Akun sendiri tidak bisa dihapus." : `Sudah dipakai di ${dipakai} data. Sembunyikan atau nonaktifkan saja.`}>Hapus</button>;
  }
  return (
    <ConfirmButton className={cls} label="Hapus" danger confirmLabel="Hapus permanen" galat={api.error}
      title={`Hapus ${nama}?`} message="Data dihapus permanen dan tidak bisa dikembalikan. Penghapusan tercatat di audit log."
      onConfirm={() => api.call(`/api/hapus/${entitas}/${encodeURIComponent(String(refId))}`, undefined, "DELETE")} />
  );
}
