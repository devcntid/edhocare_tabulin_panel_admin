"use client";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { AksiBaris, btnBaris, Field, FormDialog } from "@/components/form-dialog";
import { HapusButton } from "@/components/hapus-button";
import { input } from "@/components/ui";
import { useApi } from "@/components/use-api";

type Props = { mode: "baru" } | { mode: "baris"; id: number; nama: string; aktif: boolean; diri: boolean; dipakai: number };

export function PenggunaPanel(props: Props) {
  const api = useApi();
  const kosong = { nama: "", email: "", peran: "keuangan", password: "" };
  const [v, setV] = useState(kosong);

  if (props.mode === "baris") {
    return (
      <AksiBaris>
        {!props.diri && (
          <ConfirmButton galat={api.error} className={btnBaris} label={props.aktif ? "Nonaktifkan" : "Aktifkan"}
            title={props.aktif ? "Nonaktifkan pengguna?" : "Aktifkan pengguna?"} message={props.aktif ? "Pengguna langsung tidak bisa masuk atau memakai sesi yang sedang berjalan." : undefined}
            onConfirm={() => api.call(`/api/pengguna/${props.id}`, { aktif: !props.aktif }, "PATCH")} />
        )}
        <ConfirmButton galat={api.error} className={btnBaris} label="Reset password" title="Reset password pengguna" inputLabel="Password baru (min 10 karakter)" inputType="password" confirmLabel="Reset" onConfirm={(pw) => api.call(`/api/pengguna/${props.id}`, { password: pw }, "PATCH")} />
        <HapusButton entitas="pengguna" refId={props.id} nama={`pengguna ${props.nama}`} dipakai={props.dipakai} diri={props.diri} />
      </AksiBaris>
    );
  }

  return (
    <FormDialog tombol="+ Tambah pengguna" judul="Tambah pengguna" desc="Akun baru langsung aktif dan bisa masuk dengan password ini." busy={api.busy} onBatal={() => setV(kosong)}
      galat={api.error ? `${api.error} ${Object.values(api.fields).join(", ")}` : null}
      onSubmit={async () => {
        const ok = await api.call("/api/pengguna", v);
        if (ok) setV(kosong);
        return ok;
      }}>
      <Field label="Nama"><input className={input} required value={v.nama} onChange={(e) => setV({ ...v, nama: e.target.value })} /></Field>
      <Field label="Email"><input className={input} type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
      <Field label="Peran">
        <select className={input} value={v.peran} onChange={(e) => setV({ ...v, peran: e.target.value })}>
          <option value="admin_program">Admin Program</option><option value="keuangan">Keuangan</option><option value="super_admin">Super Admin</option>
        </select>
      </Field>
      <Field label="Password" hint="Minimal 10 karakter."><input className={input} type="password" required minLength={10} autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
    </FormDialog>
  );
}
