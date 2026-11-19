import { z } from "zod";
import { handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({
  kode: z.string().trim().regex(/^[a-z0-9_]+$/, "Kode hanya huruf kecil, angka, dan _."),
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(80),
  deskripsi: z.string().trim().max(500).optional(),
  jenis: z.enum(["va", "transfer_manual", "tunai"], "Pilih jenis metode.").default("va"),
});

export const POST = handler("keuangan", async (req, user) => {
  const b = schema.parse(await jsonBody(req));
  const { rows } = await pool.query("INSERT INTO kanal_pembayaran (kode, nama, deskripsi, aktif, jenis, urutan) VALUES ($1,$2,$3,false,$4, COALESCE((SELECT max(urutan)+1 FROM kanal_pembayaran),1)) RETURNING id", [b.kode, b.nama, b.deskripsi ?? null, b.jenis]);
  await pool.query("SELECT catat_audit($1,'buat','kanal_pembayaran',$2,NULL,$3)", [user.id, rows[0].id, JSON.stringify(b)]);
  return { id: rows[0].id };
});
