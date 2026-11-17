import bcrypt from "bcryptjs";
import { z } from "zod";
import { handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Email tidak valid."),
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(80),
  peran: z.enum(["super_admin", "admin_program", "keuangan"]),
  password: z.string().min(10, "Password minimal 10 karakter."),
});

export const GET = handler("kelola_pengguna", async () =>
  (await pool.query("SELECT id, email, nama, peran, aktif, dibuat_pada FROM pengguna_admin ORDER BY id")).rows);

export const POST = handler("kelola_pengguna", async (req, user) => {
  const b = schema.parse(await jsonBody(req));
  const { rows } = await pool.query(
    "INSERT INTO pengguna_admin (email, nama, peran, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
    [b.email, b.nama, b.peran, await bcrypt.hash(b.password, 10)]);
  await pool.query("SELECT catat_audit($1,'buat','pengguna_admin',$2,NULL,$3)", [user.id, rows[0].id, JSON.stringify({ email: b.email, peran: b.peran })]);
  return { id: rows[0].id };
});
