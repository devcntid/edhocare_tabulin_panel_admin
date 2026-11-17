// CSV for export and import (RFC 4180). No dependency: the repo has no CSV library and the files here are small, flat tables.

export type Sel = string | number | boolean | null | undefined;

/** Cells that start with these characters are run as formulas by Excel/Sheets; prefix a quote so exported data cannot execute. */
const RUMUS = /^[=+\-@\t\r]/;

const kutip = (v: Sel) => {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && RUMUS.test(s)) s = "'" + s;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** UTF-8 with BOM (Excel reads accents correctly), comma separated, CRLF. */
export function buatCsv(kepala: string[], baris: Sel[][]): string {
  return "﻿" + [kepala, ...baris].map((r) => r.map(kutip).join(",")).join("\r\n") + "\r\n";
}

/** Parses CSV text. The delimiter (comma or semicolon, as Indonesian Excel saves) is detected on the header line. Empty rows are dropped. */
export function bacaCsv(teks: string): string[][] {
  const t = teks.replace(/^﻿/, "");
  const baris1 = t.split(/\r?\n/, 1)[0] ?? "";
  const pemisah = (baris1.match(/;/g)?.length ?? 0) > (baris1.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let sel = "";
  let dalamKutip = false;
  const tutupSel = () => { row.push(sel); sel = ""; };
  const tutupBaris = () => { tutupSel(); if (row.some((c) => c.trim() !== "")) out.push(row); row = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dalamKutip) {
      if (c === '"') { if (t[i + 1] === '"') { sel += '"'; i++; } else dalamKutip = false; }
      else sel += c;
    } else if (c === '"' && sel === "") dalamKutip = true;
    else if (c === pemisah) tutupSel();
    else if (c === "\n") tutupBaris();
    else if (c !== "\r") sel += c;
  }
  if (dalamKutip) throw new Error("CSV tidak valid: tanda kutip tidak ditutup.");
  if (sel !== "" || row.length) tutupBaris();
  return out;
}
