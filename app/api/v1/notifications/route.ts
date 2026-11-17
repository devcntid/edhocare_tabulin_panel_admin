import { appHandler, bodyJson, halaman, potong } from "@/lib/app-api";
import { notifikasiList, tandaiDibaca } from "@/lib/services/app";

export const GET = appHandler(async (req, pasien) => {
  const h = halaman(new URL(req.url));
  const { rows, belumDibaca } = await notifikasiList(pasien, h);
  return { body: { ...potong(rows, h), jumlah_notifikasi_belum_dibaca: belumDibaca } };
});

export const PATCH = appHandler(async (req, pasien) => ({ body: await tandaiDibaca(pasien, await bodyJson(req)) }));
