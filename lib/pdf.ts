// Minimal PDF writer for the transaction receipt (contract BKT / E-09): one A5 page, built-in Helvetica, text and rules only.
// No dependency: the repo has no PDF library and a receipt only needs lines of text. Text is encoded as WinAnsi (Latin-1); other characters become "?".

const LEBAR = 420;
const TINGGI = 595;
const MARGIN = 40;

type Elemen =
  | { jenis: "teks"; x: number; y: number; ukuran: number; tebal: boolean; abu: boolean; teks: string }
  | { jenis: "garis"; y: number };

const esc = (s: string) => Array.from(s).map((c) => (c.charCodeAt(0) > 255 ? "?" : c)).join("").replace(/[\\()]/g, (c) => "\\" + c).replace(/[\r\n]+/g, " ");

function isiHalaman(el: Elemen[]): string {
  const out: string[] = [];
  for (const e of el) {
    if (e.jenis === "garis") out.push(`0.8 G 0.5 w ${MARGIN} ${e.y} m ${LEBAR - MARGIN} ${e.y} l S`);
    else out.push(`BT /${e.tebal ? "F2" : "F1"} ${e.ukuran} Tf ${e.abu ? "0.4 g" : "0 g"} ${e.x} ${e.y} Td (${esc(e.teks)}) Tj ET`);
  }
  return out.join("\n");
}

function rakit(isi: string): Buffer {
  const obj = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LEBAR} ${TINGGI}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(isi, "latin1")} >>\nstream\n${isi}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
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
  return rakit(isiHalaman(el));
}
