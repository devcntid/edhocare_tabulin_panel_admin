import { fmtRp } from "@/lib/format";

// Server-rendered HTML/CSS charts (no chart library). Single hue per chart; status chart uses
// categorical slots 1-3 of the reference palette with visible labels + a table fallback.
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const bulanPendek = (periode: string) => `${BULAN[Number(periode.slice(5, 7)) - 1]} ${periode.slice(2, 4)}`;

type Point = { periode: string; nilai: number };

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
      <h2 className="font-bold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-[#666]">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const compact = (n: number, uang: boolean) => {
  if (!uang) return String(n);
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${+(a / 1e9).toFixed(1)} M` : a >= 1e6 ? `${+(a / 1e6).toFixed(1)} jt` : a >= 1e3 ? `${Math.round(a / 1e3)} rb` : String(a);
  return (n < 0 ? "-" : "") + s;
};

/** Vertical bars over time. Bars are anchored to a zero baseline; negatives (corrections) are drawn in red below it. */
export function BarSeries({ title, note, data, uang = false, satuan = "" }: { title: string; note?: string; data: Point[]; uang?: boolean; satuan?: string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.nilai)));
  const semuaNol = data.every((d) => d.nilai === 0);
  const fmt = (n: number) => (uang ? fmtRp(n) : `${n}${satuan}`);
  return (
    <Panel title={title} note={note}>
      {semuaNol ? (
        <p className="py-10 text-center text-[13px] text-[#888]">Belum ada data pada periode ini.</p>
      ) : (
        <div role="img" aria-label={`${title}: ${data.map((d) => `${bulanPendek(d.periode)} ${fmt(d.nilai)}`).join(", ")}`} className="flex h-44 items-end gap-3">
          {data.map((d) => (
            <div key={d.periode} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${bulanPendek(d.periode)}: ${fmt(d.nilai)}`}>
              <span className="mb-1 text-[11px] font-semibold text-[#444]">{d.nilai ? compact(d.nilai, uang) : ""}</span>
              <div
                className={`w-full max-w-14 rounded-t-[4px] ${d.nilai < 0 ? "bg-red-500" : "bg-[var(--primary)]"}`}
                style={{ height: `${Math.max(d.nilai ? 3 : 0, (Math.abs(d.nilai) / max) * 85)}%` }}
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-3 border-t border-[#eee] pt-2">
        {data.map((d) => <span key={d.periode} className="min-w-0 flex-1 text-center text-[11px] text-[#666]">{bulanPendek(d.periode)}</span>)}
      </div>
      <details className="mt-3 text-xs text-[#666]">
        <summary className="cursor-pointer font-semibold">Lihat sebagai tabel</summary>
        <table className="mt-2 w-full"><tbody>{data.map((d) => <tr key={d.periode}><td className="py-0.5">{bulanPendek(d.periode)}</td><td className="text-right">{fmt(d.nilai)}</td></tr>)}</tbody></table>
      </details>
    </Panel>
  );
}

export type Segmen = { label: string; nilai: number; warna: string };

/** One stacked horizontal bar (parts of a whole) with a legend carrying the numbers, so color is never the only cue. */
export function StackedShare({ title, note, data }: { title: string; note?: string; data: Segmen[] }) {
  const total = data.reduce((s, d) => s + d.nilai, 0);
  return (
    <Panel title={title} note={note}>
      {total === 0 ? (
        <p className="py-6 text-center text-[13px] text-[#888]">Belum ada data.</p>
      ) : (
        <>
          <div role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.nilai}`).join(", ")}`} className="flex h-6 gap-0.5 overflow-hidden rounded-md">
            {data.filter((d) => d.nilai > 0).map((d) => (
              <div key={d.label} title={`${d.label}: ${d.nilai} (${Math.round((d.nilai / total) * 100)}%)`} style={{ width: `${(d.nilai / total) * 100}%`, background: d.warna }} />
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-[13px]">
            {data.map((d) => (
              <li key={d.label} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: d.warna }} />
                <span className="flex-1">{d.label}</span>
                <b>{d.nilai}</b>
                <span className="w-10 text-right text-[#666]">{Math.round((d.nilai / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Ranked horizontal bars for one categorical measure (single hue, value label at the bar end). */
export function HBars({ title, note, data }: { title: string; note?: string; data: { label: string; nilai: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.nilai));
  return (
    <Panel title={title} note={note}>
      <ul className="space-y-2.5 text-[13px]">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-3" title={`${d.label}: ${d.nilai}`}>
            <span className="w-40 shrink-0 truncate">{d.label}</span>
            <div className="h-3 flex-1"><div className="h-full rounded-r-[4px] bg-[var(--primary)]" style={{ width: `${(d.nilai / max) * 100}%`, minWidth: d.nilai ? 3 : 0 }} /></div>
            <b className="w-8 text-right">{d.nilai}</b>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const SERI = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const warnaSeri = (i: number) => SERI[i % SERI.length];

/** Line + soft area over time, one series, 2px line, 8px markers with surface ring, y grid, per-point tooltip. */
export function LineArea({ title, note, data, uang = false }: { title: string; note?: string; data: Point[]; uang?: boolean }) {
  const W = 600, H = 230, L = 52, R = 30, T = 18, B = 30;
  const max = Math.max(1, ...data.map((d) => d.nilai));
  const min = Math.min(0, ...data.map((d) => d.nilai));
  const span = max - min || 1;
  const x = (i: number) => L + (data.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (1 - (v - min) / span) * (H - T - B);
  const pts = data.map((d, i) => `${x(i)},${y(d.nilai)}`).join(" ");
  const base = y(Math.max(0, min));
  const ticks = [0, 1, 2, 3].map((k) => min + (span * k) / 3);
  const fmt = (n: number) => (uang ? fmtRp(n) : String(n));
  return (
    <Panel title={title} note={note}>
      {data.every((d) => d.nilai === 0) ? (
        <p className="py-10 text-center text-[13px] text-[#888]">Belum ada data pada periode ini.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${data.map((d) => `${bulanPendek(d.periode)} ${fmt(d.nilai)}`).join(", ")}`} className="w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e8eaed" strokeWidth="1" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#666">{compact(Math.round(t), uang)}</text>
            </g>
          ))}
          <polygon points={`${x(0)},${base} ${pts} ${x(data.length - 1)},${base}`} fill="var(--primary)" opacity="0.12" />
          <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={d.periode}>
              <circle cx={x(i)} cy={y(d.nilai)} r="5" fill="var(--primary)" stroke="#fff" strokeWidth="2"><title>{`${bulanPendek(d.periode)}: ${fmt(d.nilai)}`}</title></circle>
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#666">{bulanPendek(d.periode)}</text>
            </g>
          ))}
        </svg>
      )}
      <details className="mt-3 text-xs text-[#666]">
        <summary className="cursor-pointer font-semibold">Lihat sebagai tabel</summary>
        <table className="mt-2 w-full"><tbody>{data.map((d) => <tr key={d.periode}><td className="py-0.5">{bulanPendek(d.periode)}</td><td className="text-right">{fmt(d.nilai)}</td></tr>)}</tbody></table>
      </details>
    </Panel>
  );
}

/** Donut with the total in the hole and a legend that carries the numbers (color is never the only cue). */
export function Donut({ title, note, data, pusat }: { title: string; note?: string; data: Segmen[]; pusat: string }) {
  const total = data.reduce((s, d) => s + d.nilai, 0);
  const r = 52, C = 2 * Math.PI * r, gap = data.filter((d) => d.nilai > 0).length > 1 ? 2 : 0;
  let acc = 0;
  return (
    <Panel title={title} note={note}>
      {total === 0 ? (
        <p className="py-6 text-center text-[13px] text-[#888]">Belum ada data.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <svg viewBox="0 0 140 140" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.nilai}`).join(", ")}`} className="h-36 w-36 shrink-0 -rotate-90">
            <circle cx="70" cy="70" r={r} fill="none" stroke="#f0f1f3" strokeWidth="18" />
            {data.filter((d) => d.nilai > 0).map((d) => {
              const len = (d.nilai / total) * C;
              const el = (
                <circle key={d.label} cx="70" cy="70" r={r} fill="none" stroke={d.warna} strokeWidth="18"
                  strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-acc}>
                  <title>{`${d.label}: ${d.nilai} (${Math.round((d.nilai / total) * 100)}%)`}</title>
                </circle>
              );
              acc += len;
              return el;
            })}
            <g transform="rotate(90 70 70)">
              <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1a1a1a">{total}</text>
              <text x="70" y="86" textAnchor="middle" fontSize="10" fill="#666">{pusat}</text>
            </g>
          </svg>
          <ul className="min-w-40 flex-1 space-y-2 text-[13px]">
            {data.map((d) => (
              <li key={d.label} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: d.warna }} />
                <span className="flex-1">{d.label}</span><b>{d.nilai}</b>
                <span className="w-10 text-right text-[#666]">{Math.round((d.nilai / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
