import { z } from "zod";
import { ApiError, handler, jsonBody } from "@/lib/api";
import { pool } from "@/lib/db";

type Ctx = { params: Promise<{ kode: string }> };

const schema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(80).optional(),
  kategori: z.enum(["pendaftaran", "tagihan", "pembayaran", "milestone"], "Pilih kategori.").optional(),
  judul: z.string().trim().min(1, "Judul wajib diisi.").max(150).optional(),
  isi: z.string().trim().min(1, "Isi wajib diisi.").max(1000).optional(),
  aktif: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "Tidak ada perubahan.");

export const PATCH = handler<Ctx>("verifikasi", async (req, user, ctx) => {
  const kode = (await ctx.params).kode;
  const b = schema.parse(await jsonBody(req));
  const lama = (await pool.query("SELECT * FROM templat_notifikasi WHERE kode = $1", [kode])).rows[0];
  if (!lama) throw new ApiError(404, "TIDAK_DITEMUKAN", "Templat tidak ditemukan.");
  const nama = b.nama ?? lama.nama, kategori = b.kategori ?? lama.kategori, judul = b.judul ?? lama.judul, isi = b.isi ?? lama.isi, aktif = b.aktif ?? lama.aktif;
  const dipakai = [...(judul + isi).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
  const tidak = dipakai.filter((v) => !(lama.variabel as string[]).includes(v));
  if (tidak.length) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { isi: `Variabel tidak tersedia: ${[...new Set(tidak)].join(", ")}. Tersedia: ${lama.variabel.join(", ")}.` });
  if (/\{\{\s+|\s+\}\}/.test(judul + isi)) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { isi: "Tulis variabel tanpa spasi, mis. {{nama}}." });
  await pool.query("UPDATE templat_notifikasi SET nama=$2, kategori=$3, judul=$4, isi=$5, aktif=$6, diubah_pada=now() WHERE kode=$1", [kode, nama, kategori, judul, isi, aktif]);
  await pool.query("SELECT catat_audit($1,'ubah','templat_notifikasi',NULL,$2,$3)", [user.id, JSON.stringify({ kode, nama: lama.nama, kategori: lama.kategori, judul: lama.judul, isi: lama.isi, aktif: lama.aktif }), JSON.stringify({ kode, nama, kategori, judul, isi, aktif })]);
  return { ok: true };
});
