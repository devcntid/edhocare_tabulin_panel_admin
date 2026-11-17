import { appHandler, bodyJson } from "@/lib/app-api";
import { daftarApp } from "@/lib/services/app";

export const POST = appHandler(async (req, pasien) => ({
  status: 201,
  body: await daftarApp(pasien, await bodyJson(req), req.headers.get("idempotency-key")?.trim() || null),
}));
