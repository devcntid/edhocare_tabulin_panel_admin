import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Halaman, PageHeader, Section } from "@/components/page";
import { Table, Uang } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { detailPasien } from "@/lib/services/laporan";

export default async function Page({ params }: { params: Promise<{ noRm: string }> }) {
  const noRm = decodeURIComponent((await params).noRm);
  const d = await detailPasien(noRm);
  if (!d.profil) notFound();
  return (
    <Halaman>
      <PageHeader title={d.profil.nama} desc={`No. RM ${noRm} · ${d.profil.no_hp} · data dari aplikasi/API (hanya baca)`} />
      <Section title="Pendaftaran">
        <Table head={["No.", "Faskes", "Kamar · Persalinan", "Status", "Saldo", "Terkirim"]}>
          {d.pendaftaran.map((p) => (
            <tr key={p.id}>
              <td><Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${p.id}`}>{p.nomor}</Link></td>
              <td>{p.faskes}</td><td>{p.kelas_kamar} · {p.cara_persalinan}</td><td><Badge value={p.status_pendaftaran} /></td>
              <Uang v={p.saldo} /><td>{fmtTgl(p.dibuat_pada)}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Riwayat setoran (semua pendaftaran)">
        <Table head={["No. transaksi", "Pendaftaran", "Jenis", "Tgl bayar", "Nominal", "Saldo setelah"]} empty={!d.transaksi.length}>
          {d.transaksi.map((t) => (
            <tr key={t.nomor}>
              <td>{t.nomor}</td><td>{t.nomor_pendaftaran}</td><td>{t.jenis}</td><td>{fmtTgl(t.tanggal_bayar)}</td>
              <Uang v={t.nominal_transaksi} /><Uang v={t.saldo_setelah} />
            </tr>
          ))}
        </Table>
      </Section>
    </Halaman>
  );
}
