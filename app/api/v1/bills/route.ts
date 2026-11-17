import { appHandler, halaman, potong } from "@/lib/app-api";
import { tagihanList } from "@/lib/services/app";

export const GET = appHandler(async (req, pasien) => {
  const url = new URL(req.url);
  const h = halaman(url);
  return { body: potong(await tagihanList(pasien, url, h), h) };
});
