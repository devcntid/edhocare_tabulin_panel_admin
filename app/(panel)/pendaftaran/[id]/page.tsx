import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { Badge, label } from "@/components/badge";
import { Halaman, PageHeader, Section } from "@/components/page";
import { Info, InfoGrid, Stat, StatGrid } from "@/components/stat";
import { Pager, Table, Uang, one, pageNum, perNum } from "@/components/table";
import { card } from "@/components/ui";
import { fmtRp, fmtTgl } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { klaimPendaftaran } from "@/lib/services/klaim";
import { detail } from "@/lib/services/pendaftaran";
import { potong } from "@/lib/services/daftar";
import { addDays } from "@/lib/services/tabungan";
import { Actions, KoreksiButton, TolakKlaimButton } from "./actions";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const qs = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (one(v) ? [[k, one(v) as string]] : [])));
  const hal = <T,>(baris: T[], awalan: string) => potong(baris, pageNum(sp[`${awalan}_page`]), perNum(sp[`${awalan}_per`]));
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const d = await detail(id).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  const [user, klaim] = await Promise.all([getCurrentUser(), klaimPendaftaran(id)]);
  const p = d.pendaftaran;
  const bisaKeuangan = !!user && can(user.peran, "keuangan");
  const bisaVerifikasi = !!user && can(user.peran, "verifikasi");
  const [jd, tg, kl, bb, nf, rw] = [hal(d.jadwal, "jd"), hal(d.tagihan, "tg"), hal(klaim, "kl"), hal(d.transaksi, "bb"), hal(d.notifikasi, "nf"), hal(d.audit, "rw")];
  const pager = (h: { page: number; pages: number; total: number; per: number }, awalan: string, jangkar: string) => (
    <Pager basis={`/pendaftaran/${p.id}`} params={qs} page={h.page} pages={h.pages} total={h.total} per={h.per} awalan={awalan} jangkar={jangkar} />
  );

  return (
    <Halaman>
      <PageHeader
        title={p.nama}
        lencana={<><Badge value={p.status_pendaftaran} />{d.status && <Badge value={d.status.badge} />}</>}
        desc={p.nomor}
      />

      <InfoGrid>
        <Info label="No. RM">{p.no_rm}</Info><Info label="No. HP">{p.no_hp}</Info><Info label="Faskes">{p.faskes}</Info>
        <Info label="Virtual Account">{p.no_va ? `${p.bank_va} ${p.no_va}` : "Belum dipasang"}</Info>
        <Info label="Kamar">{p.kelas_kamar}</Info><Info label="Persalinan">{p.cara_persalinan}</Info><Info label="Tier">{p.tier}</Info>
        <Info label="HPHT">{fmtTgl(p.hpht)}</Info><Info label="Usia kehamilan">{`${d.usia_kehamilan.minggu} mgg ${d.usia_kehamilan.hari} hr`}</Info>
        <Info label="Milestone (28 mgg)">{fmtTgl(p.tanggal_milestone)}</Info><Info label="Perkiraan HPL">{fmtTgl(p.perkiraan_hpl)}</Info>
        {p.selesai_pada && <Info label="Selesai">{fmtTgl(p.selesai_pada)}</Info>}
        {p.alasan_penolakan && <Info label="Alasan penolakan">{p.alasan_penolakan}</Info>}
      </InfoGrid>

      <InfoGrid>
        <Info label="Total tagihan" v={p.tarif_total} uang />
        <Info label="DP" v={p.dp} uang />
        <Info label="Target 50%" v={p.target_50} uang />
        <Info label={p.jumlah_cicilan ? "Cicilan reguler" : "Setoran minimum"} v={p.setoran_min_bulanan} uang />
        {!p.jumlah_cicilan && <Info label="Rencana">{label(p.jenis_rencana)}</Info>}
      </InfoGrid>

      <Actions
        id={p.id} status={p.status_pendaftaran}
        bisaVerifikasi={bisaVerifikasi} bisaKeuangan={bisaKeuangan}
        tagihanBaru={d.tagihan_baru}
        tagihanBelumLunas={d.tagihan.filter((t) => t.status !== "lunas" && !t.menunggu_gateway).map((t) => ({ id: t.id, nomor: t.nomor, nominal: Number(t.nominal) }))}
        tanggalMaks={addDays(d.hari_ini, -1)}
      />

      <StatGrid>
        <Stat label="Total bill" v={d.bill.total} uang />
        <Stat label="Sudah terbayar" v={d.bill.terbayar} uang />
        <Stat label="Sisa" v={d.bill.sisa} uang />
        <Stat label="Cicilan">
          {d.bill.jumlah_cicilan ? <>{d.bill.cicilan_lunas} dari {d.bill.jumlah_cicilan} lunas <span className="text-[13px] font-normal text-[#666]">· sisa {d.bill.jumlah_cicilan - d.bill.cicilan_lunas}</span></> : "-"}
        </Stat>
      </StatGrid>

      {["aktif", "selesai"].includes(p.status_pendaftaran) && (
        <section className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs text-[#666]">Progres tabungan</div>
            <div className="text-[13px] text-[#666]">{p.progres_ke_50}% dari target 50% · {p.progres_ke_100}% dari tarif</div>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e5e7eb]"><div className="h-full bg-[var(--primary)]" style={{ width: `${Math.min(100, p.progres_ke_50)}%` }} /></div>
          {d.status && (
            <p className="mt-3 text-[13px] text-[#555]">
              Sisa ke target 50%: <b>{fmtRp(d.status.sisa_ke_target_50)}</b> · Proyeksi saldo milestone: <b>{fmtRp(d.status.proyeksi_saldo_milestone)}</b>
              {d.status.proyeksi_kekurangan_milestone > 0 && <> (kurang {fmtRp(d.status.proyeksi_kekurangan_milestone)})</>}
              {d.status.selisih_rencana > 0 && <> · Tertinggal dari rencana {fmtRp(d.status.selisih_rencana)}</>}
            </p>
          )}
        </section>
      )}

      {d.jadwal.length > 0 && (
        <Section id="jadwal" title={`Jadwal cicilan (${d.jadwal.length} kali)`}>
          <Table head={["Cicilan ke", "Periode", "Jatuh tempo", "Nominal", "Status", "No. tagihan"]}>
            {jd.rows.map((j) => (
              <tr key={j.urutan}><td className="text-right tabular-nums">{j.urutan}</td><td>{j.periode}</td><td>{fmtTgl(j.jatuh_tempo)}</td><Uang v={j.nominal} />
                <td><Badge value={j.status_tampil} /></td><td>{j.nomor_tagihan ?? "-"}</td></tr>
            ))}
          </Table>
          {pager(jd, "jd", "jadwal")}
        </Section>
      )}


      <Section id="tagihan" title="Tagihan">
        <Table head={["No.", "Jenis", "Periode", "Nominal", "Terbit", "Jatuh tempo", "Status", "Ref. transaksi"]} empty={!d.tagihan.length}>
          {tg.rows.map((t) => (
            <tr key={t.id}><td>{t.nomor}</td><td>{t.jenis === "dp" ? "DP" : "Bulanan"}</td><td>{t.periode}</td><Uang v={t.nominal} />
              <td>{fmtTgl(t.terbit_pada)}</td><td>{fmtTgl(t.jatuh_tempo)}</td><td><Badge value={t.status_tampil} /></td><td>{t.ref_transaksi ?? "-"}</td></tr>
          ))}
        </Table>
        {pager(tg, "tg", "tagihan")}
      </Section>

      {klaim.length > 0 && (
        <Section id="klaim" title="Laporan transfer pasien (klaim)">
          <Table head={["No.", "Tagihan", "Nominal", "Tgl transfer", "Bank / pengirim", "Dikirim", "Status", "Bukti", ""]}>
            {kl.rows.map((k) => (
              <tr key={k.id}>
                <td>{k.nomor}</td><td>{k.nomor_tagihan}</td><Uang v={Number(k.nominal_transfer)} /><td>{fmtTgl(k.tanggal_transfer)}</td>
                <td>{k.bank_asal}<div className="text-xs text-[#888]">{k.nama_pengirim}</div></td><td>{fmtTgl(k.dikirim_pada)}</td>
                <td><Badge value={k.status} />{k.alasan_penolakan && <div className="text-xs text-[#888]">{k.alasan_penolakan}</div>}</td>
                <td><a className="text-xs underline" href={`/api/klaim/${k.id}/berkas`} target="_blank" rel="noreferrer">{k.nama_berkas}</a></td>
                <td>{bisaKeuangan && k.status === "menunggu_konfirmasi" && p.status_pendaftaran === "aktif" ? <TolakKlaimButton id={k.id} nomor={k.nomor} /> : null}</td>
              </tr>
            ))}
          </Table>
          {pager(kl, "kl", "klaim")}
        </Section>
      )}

      <Section id="buku-besar" title="Buku besar setoran">
        <Table head={["No.", "Jenis", "Tgl bayar", "Nominal", "Saldo setelah", "Dikonfirmasi", "Ket.", ""]} empty={!d.transaksi.length}>
          {bb.rows.map((t) => {
            const sudahDikoreksi = d.transaksi.some((x) => x.koreksi_dari === t.id);
            return (
              <tr key={t.id}>
                <td>{t.nomor}<a className="ml-2 text-xs underline" href={`/api/transaksi/${t.id}/bukti`}>PDF</a></td><td>{t.jenis}{t.sumber === "api" && <span className="ml-1 text-xs text-[#888]">(API)</span>}</td><td>{fmtTgl(t.tanggal_bayar)}</td>
                <Uang v={t.nominal_transaksi} />
                <Uang v={t.saldo_setelah} /><td>{fmtTgl(t.tanggal_konfirmasi)}<div className="text-xs text-[#888]">{t.admin_nama}</div></td>
                <td>{t.keterangan ?? ""}</td>
                <td>{bisaKeuangan && p.status_pendaftaran === "aktif" && t.nominal_transaksi > 0 && !sudahDikoreksi ? <KoreksiButton id={t.id} nomor={t.nomor} /> : sudahDikoreksi ? <span className="text-xs text-[#888]">dikoreksi</span> : null}</td>
              </tr>
            );
          })}
        </Table>
        {pager(bb, "bb", "buku-besar")}
      </Section>

      <Section id="notifikasi" title="Notifikasi terkirim">
        <Table head={["Waktu", "Kategori", "Templat", "Status kirim", "Pesan"]} empty={!d.notifikasi.length}>
          {nf.rows.map((n) => <tr key={n.id}><td className="whitespace-nowrap">{fmtTgl(n.dibuat_pada)}</td><td>{label(n.kategori)}</td><td className="text-xs text-[#666]">{n.templat_kode ?? "-"}</td><td>{n.status_kirim}</td><td><div className="font-semibold">{n.judul}</div><div className="text-[#555]">{n.isi}</div></td></tr>)}
        </Table>
        {pager(nf, "nf", "notifikasi")}
      </Section>

      <Section id="riwayat" title="Riwayat aksi">
        <Table head={["Waktu", "Admin", "Aksi", "Detail"]} empty={!d.audit.length}>
          {rw.rows.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{fmtTgl(l.dibuat_pada)}</td><td>{l.admin_nama ?? "-"}</td><td>{l.aksi}</td><td className="max-w-md truncate font-mono text-xs">{l.sesudah ? JSON.stringify(l.sesudah) : ""}</td></tr>)}
        </Table>
        {pager(rw, "rw", "riwayat")}
      </Section>
    </Halaman>
  );
}
