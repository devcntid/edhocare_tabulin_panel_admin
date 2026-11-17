import { redirect } from "next/navigation";
import { Halaman, PageHeader } from "@/components/page";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { opsiForm, today } from "@/lib/services/pendaftaran";
import { BaruForm } from "./baru-form";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user || !can(user.peran, "verifikasi")) redirect("/pendaftaran");
  return (
    <Halaman>
      <PageHeader title="Pendaftaran baru (manual)" desc="Pasien biasanya mendaftar lewat aplikasi. Formulir ini untuk demo atau pendaftaran bantuan petugas: pilih pasien dari data pasien, lalu faskes, cara persalinan, dan kelas kamar." />
      <div className="max-w-2xl"><BaruForm opsi={await opsiForm()} hariIni={await today()} /></div>
    </Halaman>
  );
}
