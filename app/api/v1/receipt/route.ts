import { appHandler } from "@/lib/app-api";
import { receipt } from "@/lib/services/bukti";

// E-09
export const GET = appHandler(async (req, pasien) => {
  const url = new URL(req.url);
  return { body: await receipt(pasien, url.searchParams.get("id_transaksi"), url.origin) };
});
