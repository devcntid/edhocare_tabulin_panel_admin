import { z } from "zod";
import { handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

export const instruksiSchema = z.object({
  kanal_id: z.number().int().positive("Pilih metode pembayaran."),
  judul: z.string().trim().min(1, "Judul wajib diisi.").max(120),
  isi: z.string().trim().min(1, "Isi instruksi wajib diisi.").max(1000),
  nama_bank: z.string().trim().max(60).optional(),
  nama_rekening: z.string().trim().max(80).optional(),
  nomor_rekening: z.string().trim().regex(/^[0-9 ]*$/, "Nomor rekening hanya angka.").max(30).optional(),
});

export const POST = handler("keuangan", async (req, user) => {
  const b = instruksiSchema.parse(await jsonBody(req));
  const { rows } = await pool.query(
    "INSERT INTO instruksi_pembayaran (kanal_id, judul, isi, nama_bank, nama_rekening, nomor_rekening, urutan) VALUES ($1,$2,$3,$4,$5,$6, COALESCE((SELECT max(urutan)+1 FROM instruksi_pembayaran WHERE kanal_id=$1),1)) RETURNING id",
    [b.kanal_id, b.judul, b.isi, b.nama_bank || null, b.nama_rekening || null, b.nomor_rekening || null]);
  await pool.query("SELECT catat_audit($1,'buat','instruksi_pembayaran',$2,NULL,$3)", [user.id, rows[0].id, JSON.stringify(b)]);
  return { id: rows[0].id };
});
