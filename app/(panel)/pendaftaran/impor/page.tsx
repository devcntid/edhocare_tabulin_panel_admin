import { redirect } from "next/navigation";
import { Halaman, PageHeader } from "@/components/page";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { IMPOR_MAKS_BARIS, KOLOM_IMPOR } from "@/lib/services/impor";
import { ImporForm } from "./impor-form";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user || !can(user.peran, "verifikasi")) redirect("/pendaftaran");
  return (
    <Halaman>
      <PageHeader title="Impor pendaftaran (CSV)" desc={`Beberapa pendaftaran manual sekaligus. Kolom: ${KOLOM_IMPOR.join(", ")}. Maksimal ${IMPOR_MAKS_BARIS} baris. Pasien harus sudah ada di data pasien. Semua baris disimpan bersamaan atau tidak sama sekali.`} />
      <div className="max-w-3xl"><ImporForm /></div>
    </Halaman>
  );
}
