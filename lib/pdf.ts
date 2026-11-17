// Minimal PDF writer: the transaction receipt (contract BKT / E-09, one A5 page) and table exports (landscape A4, several pages).
// Built-in Helvetica, text and rules only. No dependency: the repo has no PDF library. Text is encoded as WinAnsi (Latin-1); other characters become "?".

const LEBAR = 420;
const TINGGI = 595;
const MARGIN = 40;

type Elemen =
  | { jenis: "teks"; x: number; y: number; ukuran: number; tebal: boolean; abu: boolean; teks: string }
  | { jenis: "garis"; y: number };

const esc = (s: string) => Array.from(s).map((c) => (c.charCodeAt(0) > 255 ? "?" : c)).join("").replace(/[\\()]/g, (c) => "\\" + c).replace(/[\r\n]+/g, " ");

function isiHalaman(el: Elemen[], lebar = LEBAR): string {
  const out: string[] = [];
  for (const e of el) {
    if (e.jenis === "garis") out.push(`0.8 G 0.5 w ${MARGIN} ${e.y} m ${lebar - MARGIN} ${e.y} l S`);
    else out.push(`BT /${e.tebal ? "F2" : "F1"} ${e.ukuran} Tf ${e.abu ? "0.4 g" : "0 g"} ${e.x} ${e.y} Td (${esc(e.teks)}) Tj ET`);
  }
  return out.join("\n");
}

function rakit(isi: string[], lebar = LEBAR, tinggi = TINGGI): Buffer {
  // 1 catalog, 2 pages, 3-4 fonts, then a page + content stream per page
  const obj = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${isi.map((_, i) => `${5 + 2 * i} 0 R`).join(" ")}] /Count ${isi.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ...isi.flatMap((c, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${lebar} ${tinggi}] /Contents ${6 + 2 * i} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
      `<< /Length ${Buffer.byteLength(c, "latin1")} >>\nstream\n${c}\nendstream`,
    ]),
  ];
  const bagian: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offset: number[] = [];
  let pos = bagian[0].length;
  obj.forEach((o, i) => {
    offset.push(pos);
    const b = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1");
    bagian.push(b);
    pos += b.length;
  });
  const xref = [`xref\n0 ${obj.length + 1}\n0000000000 65535 f \n`, ...offset.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  bagian.push(Buffer.from(`${xref}trailer\n<< /Size ${obj.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
  return Buffer.concat(bagian);
}

export type BuktiPdf = {
  judul: string;
  subjudul: string;
  baris: { label: string; nilai: string }[];
  catatan: string;
};

/** Receipt layout: header, title, label/value rows, footnote. */
export function buatPdfBukti(b: BuktiPdf): Buffer {
  const el: Elemen[] = [];
  let y = TINGGI - MARGIN - 8;
  el.push({ jenis: "teks", x: MARGIN, y, ukuran: 16, tebal: true, abu: false, teks: "RS Edelweiss" });
  y -= 18;
  el.push({ jenis: "teks", x: MARGIN, y, ukuran: 10, tebal: false, abu: true, teks: b.subjudul });
  y -= 14;
  el.push({ jenis: "garis", y });
  y -= 28;
  el.push({ jenis: "teks", x: MARGIN, y, ukuran: 14, tebal: true, abu: false, teks: b.judul });
  y -= 26;
  for (const r of b.baris) {
    el.push({ jenis: "teks", x: MARGIN, y, ukuran: 9, tebal: false, abu: true, teks: r.label });
    y -= 13;
    el.push({ jenis: "teks", x: MARGIN, y, ukuran: 11, tebal: true, abu: false, teks: r.nilai });
    y -= 22;
  }
  el.push({ jenis: "garis", y: y + 6 });
  el.push({ jenis: "teks", x: MARGIN, y: y - 10, ukuran: 8, tebal: false, abu: true, teks: b.catatan });
  return rakit([isiHalaman(el)]);
}

export type TabelPdf = {
  judul: string;
  subjudul: string;
  kolom: { judul: string; kanan?: boolean }[];
  baris: string[][];
};

const A4_LEBAR = 842;
const A4_TINGGI = 595;
const M_TABEL = 30;
const TINGGI_BARIS = 15;
const LEBAR_HURUF = 4.4; // average Helvetica glyph width at 8 pt, used to fit and right-align text

const muat = (teks: string, lebar: number) => {
  const maks = Math.max(1, Math.floor(lebar / LEBAR_HURUF));
  const t = teks.replace(/[\r\n]+/g, " ");
  return Array.from(t).length <= maks ? t : Array.from(t).slice(0, Math.max(1, maks - 3)).join("") + "...";
};

/** Table export: landscape A4, header repeated on every page, columns sized to their content, long cells cut with "...". */
export function buatPdfTabel(t: TabelPdf): Buffer {
  const lebarIsi = A4_LEBAR - 2 * M_TABEL;
  const bobot = t.kolom.map((k, i) => Math.max(k.judul.length, Math.min(40, Math.max(0, ...t.baris.map((b) => (b[i] ?? "").length)))) + 2);
  const total = bobot.reduce((a, b) => a + b, 0);
  const lebar = bobot.map((b) => (b / total) * lebarIsi);
  const x = lebar.map((_, i) => M_TABEL + lebar.slice(0, i).reduce((a, b) => a + b, 0));
  const mulai = A4_TINGGI - M_TABEL - 50;
  const perHalaman = Math.max(1, Math.floor((mulai - M_TABEL - 10) / TINGGI_BARIS));
  const jumlah = Math.max(1, Math.ceil(t.baris.length / perHalaman));
  const sel = (i: number, teks: string, y: number, tebal: boolean): Elemen => {
    const s = muat(teks, lebar[i] - 6);
    const kanan = t.kolom[i].kanan;
    return { jenis: "teks", x: kanan ? x[i] + lebar[i] - 3 - s.length * LEBAR_HURUF : x[i] + 3, y, ukuran: 8, tebal, abu: false, teks: s };
  };
  const halaman: string[] = [];
  for (let h = 0; h < jumlah; h++) {
    const el: Elemen[] = [];
    el.push({ jenis: "teks", x: M_TABEL, y: A4_TINGGI - M_TABEL - 8, ukuran: 14, tebal: true, abu: false, teks: t.judul });
    el.push({ jenis: "teks", x: M_TABEL, y: A4_TINGGI - M_TABEL - 24, ukuran: 8, tebal: false, abu: true, teks: t.subjudul });
    let y = mulai;
    el.push({ jenis: "garis", y: y + 11 });
    t.kolom.forEach((k, i) => el.push(sel(i, k.judul, y, true)));
    el.push({ jenis: "garis", y: y - 4 });
    for (const b of t.baris.slice(h * perHalaman, (h + 1) * perHalaman)) {
      y -= TINGGI_BARIS;
      t.kolom.forEach((_, i) => el.push(sel(i, b[i] ?? "", y, false)));
    }
    el.push({ jenis: "teks", x: M_TABEL, y: 16, ukuran: 8, tebal: false, abu: true, teks: `Halaman ${h + 1} dari ${jumlah} - ${t.baris.length} baris` });
    halaman.push(isiHalaman(el, A4_LEBAR));
  }
  return rakit(halaman, A4_LEBAR, A4_TINGGI);
}
