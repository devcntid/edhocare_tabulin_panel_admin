import Link from "next/link";
import { Badge, label } from "@/components/badge";
import { BarSeries, Donut, HBars, LineArea, warnaSeri } from "@/components/charts";
import { Halaman, PageHeader, Section } from "@/components/page";
import { Stat, StatGrid } from "@/components/stat";
import { Table, Uang } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { dasbor } from "@/lib/services/laporan";

export default async function Dasbor() {
  const d = await dasbor();
  return (
    <Halaman>
      <PageHeader title="Dasbor" desc="Ringkasan pendaftaran, tagihan, dan setoran peserta Tabulin." />
      <Section title="Peserta">
        <StatGrid kolom={3}>
          <Stat label="Total pasien" v={d.ringkas.pasien} href="/pasien" />
          <Stat label="Menunggu verifikasi" v={d.perStatus.menunggu_verifikasi ?? 0} href="/pendaftaran?status=menunggu_verifikasi" />
          <Stat label="Menunggu pasang VA" v={d.perStatus.va_disiapkan ?? 0} href="/pendaftaran?status=va_disiapkan" />
          <Stat label="Peserta aktif" v={d.perStatus.aktif ?? 0} href="/pendaftaran?status=aktif" />
          <Stat label="Peserta tertinggal" v={d.tertinggal.length} />
          <Stat label="Selesai" v={d.perStatus.selesai ?? 0} href="/pendaftaran?status=selesai" />
        </StatGrid>
      </Section>
      <Section title="Tagihan dan setoran">
        <StatGrid kolom={3}>
          <Stat label="Total tagihan" v={d.ringkas.tagihan} href="/tagihan" />
          <Stat label="Tagihan lewat jatuh tempo" v={d.lewatTempo} href="/tagihan?status=lewat_jatuh_tempo" />
          <Stat label="Total setoran (transaksi)" v={d.ringkas.transaksi} href="/setoran" />
        </StatGrid>
      </Section>
      <Section title="Keuangan">
        <StatGrid kolom={4}>
          <Stat label="Piutang (tagihan belum dibayar)" v={d.ringkas.piutang} uang href="/tagihan?status=belum_dibayar" />
          <Stat label="Setoran diterima (total)" v={d.ringkas.diterima} uang href="/setoran" />
          <Stat label="Saldo peserta aktif" v={d.totalSaldo} uang />
          <Stat label="Setoran bulan ini" v={d.setoranBulanIni} uang href="/setoran" />
        </StatGrid>
      </Section>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineArea title="Setoran per bulan" note="Setoran terkonfirmasi (setelah koreksi), 6 bulan terakhir, menurut tanggal transfer" data={d.serieSetoran} uang />
        </div>
        <Donut
          title="Kondisi peserta aktif" note="Dibanding rencana setoran (toleransi 3 hari) dan target 50%" pusat="peserta aktif"
          data={[
            { label: "Sesuai jalur", nilai: d.kondisi.sesuai_jalur, warna: warnaSeri(0) },
            { label: "Tertinggal", nilai: d.kondisi.tertinggal, warna: warnaSeri(1) },
            { label: "Target 50% tercapai", nilai: d.kondisi.tercapai, warna: warnaSeri(2) },
          ]}
        />
        <BarSeries title="Pendaftaran masuk per bulan" note="Jumlah pendaftaran, 6 bulan terakhir" data={d.seriePendaftaran} />
        <BarSeries title="Tagihan belum dibayar per bulan jatuh tempo" note="Piutang peserta aktif, bulan ini s.d. 5 bulan ke depan" data={d.serieTagihan} uang />
        <HBars title="Peserta menurut kelas kamar" note="Pendaftaran yang masih berjalan atau selesai" data={d.perKelas} />
        <div className="lg:col-span-3">
          <Donut
            title="Pendaftaran menurut status" pusat="pendaftaran"
            data={Object.entries(d.perStatus).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: label(k), nilai: v, warna: warnaSeri(i) }))}
          />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Setoran terbaru" aksi={<Link href="/setoran" className="text-[13px] font-semibold text-[var(--primary)]">Lihat semua</Link>}>
          <Table head={["No.", "Peserta", "Nominal", "Tgl bayar"]} empty={!d.terbaru.length}>
            {d.terbaru.map((t) => (
              <tr key={t.nomor}><td>{t.nomor}{t.sumber === "api" && <span className="ml-1 text-xs text-[#888]">(API)</span>}</td>
                <td><Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${t.pid}`}>{t.nama}</Link></td>
                <Uang v={t.nominal_transaksi} /><td>{fmtTgl(t.tanggal_bayar)}</td></tr>
            ))}
          </Table>
        </Section>
        <Section title="Jatuh tempo terdekat" aksi={<Link href="/tagihan" className="text-[13px] font-semibold text-[var(--primary)]">Lihat semua</Link>}>
          <Table head={["Tagihan", "Peserta", "Nominal", "Jatuh tempo", "Status"]} empty={!d.tempo.length}>
            {d.tempo.map((t) => (
              <tr key={t.id}><td>{t.nomor}</td>
                <td><Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${t.pid}`}>{t.nama}</Link></td>
                <Uang v={t.nominal} /><td>{fmtTgl(t.jatuh_tempo)}</td><td><Badge value={t.status_tampil} /></td></tr>
            ))}
          </Table>
        </Section>
      </div>
      <Section title="Notifikasi terbaru" aksi={<Link href="/notifikasi" className="text-[13px] font-semibold text-[var(--primary)]">Lihat semua</Link>}>
        <Table head={["Waktu", "Peserta", "Kategori", "Judul", "Status kirim"]} empty={!d.notifBaru.length}>
          {d.notifBaru.map((n) => (
            <tr key={n.id}><td className="whitespace-nowrap">{fmtTgl(n.dibuat_pada)}</td>
              <td><Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${n.pid}`}>{n.nama}</Link></td>
              <td>{label(n.kategori)}</td><td>{n.judul}</td><td>{n.status_kirim}</td></tr>
          ))}
        </Table>
      </Section>
      <Section title="Menunggu verifikasi" aksi={<Link href="/pendaftaran?status=menunggu_verifikasi" className="text-[13px] font-semibold text-[var(--primary)]">Lihat semua</Link>}>
        <Table head={["No.", "Nama", "Terkirim", ""]} empty={!d.menunggu.length}>
          {d.menunggu.map((r) => (
            <tr key={r.id}><td>{r.nomor}</td><td>{r.nama}</td><td>{fmtTgl(r.dibuat_pada)}</td>
              <td><Link className="font-semibold text-[var(--primary)]" href={`/pendaftaran/${r.id}`}>Tinjau</Link></td></tr>
          ))}
        </Table>
      </Section>
      <Section title="Peserta tertinggal dari rencana">
        <Table head={["No.", "Nama", "Saldo", "Selisih rencana", ""]} empty={!d.tertinggal.length}>
          {d.tertinggal.map((r) => (
            <tr key={r.id}><td>{r.nomor}</td><td>{r.nama}</td><Uang v={r.saldo} /><Uang v={r.selisih} />
              <td><Badge value="tertinggal" /> <Link className="ml-2 font-semibold text-[var(--primary)]" href={`/pendaftaran/${r.id}`}>Buka</Link></td></tr>
          ))}
        </Table>
      </Section>
    </Halaman>
  );
}
