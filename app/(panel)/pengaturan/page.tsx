import { Halaman, PageHeader } from "@/components/page";
import { Table } from "@/components/table";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { daftarKonfigurasi } from "@/lib/services/laporan";
import { AturanBaris } from "./aturan-panel";

const ATURAN: Record<string, { nama: string; satuan: string; ket: string }> = {
  dp_persen: { nama: "Uang muka (DP)", satuan: "% tarif", ket: "Besar DP yang harus dibayar saat pendaftaran." },
  target_persen: { nama: "Target tabungan", satuan: "% tarif", ket: "Saldo yang harus tercapai sebelum milestone kehamilan." },
  milestone_minggu: { nama: "Milestone target", satuan: "minggu kehamilan", ket: "Target tabungan dinilai pada usia kehamilan ini." },
  hpl_minggu: { nama: "Usia kehamilan saat HPL", satuan: "minggu", ket: "Dasar perhitungan perkiraan tanggal persalinan." },
  batas_usia_kehamilan_hari: { nama: "Batas usia kehamilan untuk mendaftar", satuan: "hari", ket: "Pendaftaran ditolak jika usia kehamilan melewati batas ini." },
  hari_jatuh_tempo: { nama: "Tanggal jatuh tempo tagihan bulanan", satuan: "tanggal tiap bulan", ket: "Tagihan bulanan jatuh tempo pada tanggal ini." },
  hari_tempo_dp: { nama: "Batas waktu pembayaran DP", satuan: "hari", ket: "Tenggat DP dihitung sejak VA dipasang." },
  toleransi_hari: { nama: "Toleransi keterlambatan", satuan: "hari", ket: "Selisih hari yang masih dianggap tepat waktu." },
  fitur_klaim_aktif: { nama: "Fitur \"Saya sudah bayar\" (K9)", satuan: "0 = mati, 1 = hidup", ket: "Bila hidup, pasien dapat melaporkan transfer dengan bukti dari aplikasi. Keputusan K9 belum final, biarkan 0 sampai diputuskan." },
};

export default async function Page() {
  const [konfigurasi, user] = await Promise.all([daftarKonfigurasi(), getCurrentUser()]);
  const bisaKelola = !!user && can(user.peran, "kelola_paket");
  return (
    <Halaman>
      <PageHeader
        title="Pengaturan"
        desc="Aturan bisnis bawaan sistem (diisi oleh migrasi database) yang dipakai fungsi tagihan dan target, sehingga nilainya bisa diubah tapi aturannya tidak bisa ditambah atau dihapus. Dipakai sistem untuk menghitung tagihan dan target. Perubahan berlaku untuk pendaftaran dan tagihan baru; pendaftaran yang sudah ada menyimpan angkanya sendiri. Perlu persetujuan Manajemen RS, dan setiap perubahan tercatat di audit log."
      />
      <Table head={["Aturan", "Nilai", "Satuan", "Keterangan", ...(bisaKelola ? [""] : [])]}>
        {konfigurasi.map((k) => {
          const a = ATURAN[k.kunci];
          return <AturanBaris key={k.kunci} kunci={k.kunci} nama={a?.nama ?? k.kunci} nilai={Number(k.nilai)} satuan={a?.satuan ?? ""} ket={a?.ket ?? ""} bisaKelola={bisaKelola} />;
        })}
      </Table>
    </Halaman>
  );
}
