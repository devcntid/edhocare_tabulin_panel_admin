import { appHandler, bodyJson } from "@/lib/app-api";
import { daftarPerangkat } from "@/lib/services/app";

export const POST = appHandler(async (req, pasien) => ({ body: await daftarPerangkat(pasien, await bodyJson(req)) }));
