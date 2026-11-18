import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Halaman, PageHeader, Section, TombolDetail } from "@/components/page";
import { Pager, Table, Uang, one, pageNum, perNum } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { potong } from "@/lib/services/daftar";
import { detailPasien } from "@/lib/services/laporan";

export default async function Page({ params, searchParams }: { params: Promise<{ noRm: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const noRm = decodeURIComponent((await params).noRm);
  const sp = await searchParams;
  const qs = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (one(v) ? [[k, one(v) as string]] : [])));
  const d = await detailPasien(noRm);
  if (!d.profil) notFound();
  const pd = potong(d.pendaftaran, pageNum(sp.pd_page), perNum(sp.pd_per));
  const tx = potong(d.transaksi, pageNum(sp.tx_page), perNum(sp.tx_per));
  const basis = `/pasien/${encodeURIComponent(noRm)}`;
  return (
    <Halaman>
      <PageHeader title={d.profil.nama} desc={`No. RM ${noRm} · ${d.profil.no_hp} · data dari aplikasi/API (hanya baca)`} />
      <Section id="pendaftaran" title="Pendaftaran">
        <Table head={["No.", "Faskes", "Kamar · Persalinan", "Status", "Saldo", "Terkirim", "Aksi"]}>
          {pd.rows.map((p) => (
            <tr key={p.id}>
              <td><Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${p.id}`}>{p.nomor}</Link></td>
              <td>{p.faskes}</td><td>{p.kelas_kamar} · {p.cara_persalinan}</td><td><Badge value={p.status_pendaftaran} /></td>
              <Uang v={p.saldo} /><td>{fmtTgl(p.dibuat_pada)}</td>
              <td className="w-px whitespace-nowrap"><div className="flex justify-end"><TombolDetail href={`/pendaftaran/${p.id}`} /></div></td>
            </tr>
          ))}
        </Table>
        <Pager basis={basis} params={qs} page={pd.page} pages={pd.pages} total={pd.total} per={pd.per} awalan="pd" jangkar="pendaftaran" />
      </Section>
      <Section id="setoran" title="Riwayat setoran (semua pendaftaran)">
        <Table head={["No. transaksi", "Pendaftaran", "Jenis", "Tgl bayar", "Nominal", "Saldo setelah"]} empty={!d.transaksi.length}>
          {tx.rows.map((t) => (
            <tr key={t.nomor}>
              <td>{t.nomor}</td><td>{t.nomor_pendaftaran}</td><td>{t.jenis}</td><td>{fmtTgl(t.tanggal_bayar)}</td>
              <Uang v={t.nominal_transaksi} /><Uang v={t.saldo_setelah} />
            </tr>
          ))}
        </Table>
        <Pager basis={basis} params={qs} page={tx.page} pages={tx.pages} total={tx.total} per={tx.per} awalan="tx" jangkar="setoran" />
      </Section>
    </Halaman>
  );
}
