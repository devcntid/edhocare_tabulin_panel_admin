import Link from "next/link";
import { Activity, Bell, CalendarClock, ClipboardList, CreditCard, FileText, UserPlus, UserRound, Users, Wallet, ArrowLeftRight } from "lucide-react";
import { Badge, label } from "@/components/badge";
import { BarSeries, Donut, HBars, LineArea, warnaSeri } from "@/components/charts";
import { Halaman, KartuPanel, PageHeader, Section } from "@/components/page";
import { KartuRingkas, KartuTugas, Stat, StatGrid } from "@/components/stat";
import { Table, Uang } from "@/components/table";
import { fmtTgl } from "@/lib/format";
import { dasbor } from "@/lib/services/laporan";

const tautan = "font-semibold text-[var(--primary)] hover:underline";

export default async function Dasbor() {
  const d = await dasbor();
  const aktif = d.perStatus.aktif ?? 0;
  const persenTarget = aktif ? Math.round((d.kondisi.tercapai / aktif) * 100) : 0;
  const nol = (n: number, chip: string, nada: "amber" | "sky" | "rose" | "violet", tanpa: string) => ({ chip: n > 0 ? chip : tanpa, nada: n > 0 ? nada : ("green" as const) });
  return (
    <Halaman>
      <PageHeader title="Dasbor" desc="Ringkasan operasional dan keuangan program Tabulin." />

      <Section title="Pekerjaan yang perlu ditindaklanjuti">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KartuTugas label="Menunggu verifikasi" v={d.perStatus.menunggu_verifikasi ?? 0} ikon={UserPlus} href="/pendaftaran?status=menunggu_verifikasi" {...nol(d.perStatus.menunggu_verifikasi ?? 0, "Perlu tindakan", "amber", "Tidak ada")} />
          <KartuTugas label="Menunggu pemasangan VA" v={d.perStatus.va_disiapkan ?? 0} ikon={CreditCard} href="/pendaftaran?status=va_disiapkan" {...nol(d.perStatus.va_disiapkan ?? 0, "Dalam proses", "sky", "Tidak ada")} />
          <KartuTugas label="Tagihan jatuh tempo" v={d.lewatTempo} ikon={CalendarClock} href="/tagihan?status=lewat_jatuh_tempo" {...nol(d.lewatTempo, "Perlu tindakan", "rose", "Aman")} />
          <KartuTugas label="Perlu ditinjau" v={d.tertinggal.length} ikon={Bell} {...nol(d.tertinggal.length, "Peserta tertinggal", "violet", "Tidak ada")} />
        </div>
      </Section>

      <Section title="Ringkasan keuangan dan peserta">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KartuRingkas label="Peserta aktif" v={aktif} ikon={Users} href="/pendaftaran?status=aktif" catatan={`${d.ringkas.pasien} pasien terdaftar`} />
          <KartuRingkas label="Saldo peserta aktif" v={d.totalSaldo} uang ikon={Wallet} catatan="Total saldo tabungan" />
          <KartuRingkas label="Setoran bulan ini" v={d.setoranBulanIni} uang ikon={ArrowLeftRight} href="/setoran" catatan="Terkonfirmasi bulan berjalan" />
          <KartuRingkas label="Piutang belum dibayar" v={d.ringkas.piutang} uang ikon={FileText} href="/tagihan?status=belum_dibayar" catatan="Tagihan peserta aktif" />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineArea title="Tren setoran per bulan" note="Setoran terkonfirmasi (setelah koreksi), 6 bulan terakhir, menurut tanggal transfer" data={d.serieSetoran} uang />
        </div>
        <div className="space-y-4">
          <Donut
            title="Kondisi peserta" note="Dibanding rencana setoran (toleransi 3 hari) dan target 50%" pusat="peserta aktif"
            data={[
              { label: "Sesuai jalur", nilai: d.kondisi.sesuai_jalur, warna: warnaSeri(0) },
              { label: "Tertinggal", nilai: d.kondisi.tertinggal, warna: warnaSeri(1) },
              { label: "Target 50% tercapai", nilai: d.kondisi.tercapai, warna: warnaSeri(2) },
            ]}
          />
          <section className="rounded-2xl border border-[#e1eaf2] bg-white p-5 shadow-[0_1px_3px_rgba(16,64,96,0.06)]">
            <h2 className="font-bold text-[#14232e]">Pencapaian target tabungan</h2>
            <p className="mt-0.5 text-xs text-[#5b6b78]">{d.kondisi.tercapai} dari {aktif} peserta ({persenTarget}%) mencapai ≥ 50% target</p>
            <div className="mt-3 flex items-center gap-3">
              <div role="progressbar" aria-valuenow={persenTarget} aria-valuemin={0} aria-valuemax={100} aria-label="Peserta yang mencapai target" className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e6edf3]">
                <div className="h-full rounded-full bg-[#1baf7a]" style={{ width: `${persenTarget}%` }} />
              </div>
              <b className="text-sm tabular-nums">{persenTarget}%</b>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <KartuPanel judul="Pendaftaran terbaru" ikon={UserRound} href="/pendaftaran">
          <Table polos head={["Tanggal", "Peserta", "Status"]} empty={!d.pendaftaranBaru.length}>
            {d.pendaftaranBaru.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap">{fmtTgl(r.dibuat_pada)}</td>
                <td><Link className={tautan} href={`/pendaftaran/${r.id}`}>{r.nama}</Link></td>
                <td><Badge value={r.status_pendaftaran} /></td></tr>
            ))}
          </Table>
        </KartuPanel>
        <KartuPanel judul="Tagihan perlu tindak lanjut" ikon={ClipboardList} href="/tagihan">
          <Table polos head={["No.", "Peserta", "Jatuh tempo", "Nominal"]} empty={!d.tempo.length}>
            {d.tempo.slice(0, 5).map((t) => (
              <tr key={t.id}><td className="whitespace-nowrap">{t.nomor}</td>
                <td><Link className={tautan} href={`/pendaftaran/${t.pid}`}>{t.nama}</Link></td>
                <td className="whitespace-nowrap">{fmtTgl(t.jatuh_tempo)}</td><Uang v={t.nominal} /></tr>
            ))}
          </Table>
        </KartuPanel>
        <KartuPanel judul="Aktivitas terbaru" ikon={Activity} href="/audit">
          {d.aktivitas.length === 0 ? <p className="px-3 py-8 text-center text-[13px] text-[#888]">Belum ada data.</p> : (
            <ol className="ml-4 space-y-3 border-l-2 border-[#d5e6f1] px-3 py-2">
              {d.aktivitas.map((n) => (
                <li key={n.id} className="relative pl-3">
                  <span aria-hidden className="absolute -left-[1.45rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--biru-merek)] ring-4 ring-white" />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-bold text-[#14232e]">{label(n.aksi)} {n.entitas}{n.entitas_id != null && ` #${n.entitas_id}`}</span>
                    <span className="shrink-0 text-xs text-[#5b6b78]">{fmtTgl(n.dibuat_pada)}</span>
                  </div>
                  <div className="text-xs text-[#5b6b78]">{n.admin_nama ?? "Sistem"}</div>
                </li>
              ))}
            </ol>
          )}
        </KartuPanel>
      </div>

      <Section title="Total keseluruhan">
        <StatGrid kolom={3}>
          <Stat label="Total pasien" v={d.ringkas.pasien} href="/pasien" />
          <Stat label="Total tagihan" v={d.ringkas.tagihan} href="/tagihan" />
          <Stat label="Total setoran (transaksi)" v={d.ringkas.transaksi} href="/setoran" />
          <Stat label="Pendaftaran selesai" v={d.perStatus.selesai ?? 0} href="/pendaftaran?status=selesai" />
          <Stat label="Setoran diterima (total)" v={d.ringkas.diterima} uang href="/setoran" />
        </StatGrid>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
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
                <td><Link className={tautan} href={`/pendaftaran/${t.pid}`}>{t.nama}</Link></td>
                <Uang v={t.nominal_transaksi} /><td>{fmtTgl(t.tanggal_bayar)}</td></tr>
            ))}
          </Table>
        </Section>
        <Section title="Menunggu verifikasi" aksi={<Link href="/pendaftaran?status=menunggu_verifikasi" className="text-[13px] font-semibold text-[var(--primary)]">Lihat semua</Link>}>
          <Table head={["No.", "Nama", "Terkirim", ""]} empty={!d.menunggu.length}>
            {d.menunggu.map((r) => (
              <tr key={r.id}><td>{r.nomor}</td><td>{r.nama}</td><td>{fmtTgl(r.dibuat_pada)}</td>
                <td><Link className={tautan} href={`/pendaftaran/${r.id}`}>Tinjau</Link></td></tr>
            ))}
          </Table>
        </Section>
      </div>
      <Section title="Peserta tertinggal dari rencana">
        <Table head={["No.", "Nama", "Saldo", "Selisih rencana", ""]} empty={!d.tertinggal.length}>
          {d.tertinggal.map((r) => (
            <tr key={r.id}><td>{r.nomor}</td><td>{r.nama}</td><Uang v={r.saldo} /><Uang v={r.selisih} />
              <td><Badge value="tertinggal" /> <Link className={`ml-2 ${tautan}`} href={`/pendaftaran/${r.id}`}>Buka</Link></td></tr>
          ))}
        </Table>
      </Section>
    </Halaman>
  );
}
