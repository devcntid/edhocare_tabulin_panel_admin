import { z } from "zod";
import { ApiError, handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

const schema = z.object({
  kode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, "Kode 2-6 huruf atau angka, mis. BDG."),
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(120),
  alamat: z.string().trim().max(300).optional(),
  no_telepon: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.email("Format email tidak valid.")]).optional(),
});

export const POST = handler("kelola_paket", async (req, user) => {
  const b = schema.parse(await jsonBody(req));
  const { rows } = await pool.query(
    "INSERT INTO faskes (kode, nama, alamat, no_telepon, email) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (kode) DO NOTHING RETURNING id",
    [b.kode, b.nama, b.alamat || null, b.no_telepon || null, b.email || null]);
  if (!rows[0]) throw new ApiError(409, "DUPLIKAT", "Kode faskes ini sudah dipakai.", { kode: "Kode sudah dipakai." });
  await pool.query("SELECT catat_audit($1,'buat','faskes',$2,NULL,$3)", [user.id, rows[0].id, JSON.stringify(b)]);
  return { id: rows[0].id as number };
});
