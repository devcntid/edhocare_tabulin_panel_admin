import { appHandler } from "@/lib/app-api";
import { pendaftaranSaya } from "@/lib/services/app";

export const GET = appHandler(async (_req, pasien) => ({ body: await pendaftaranSaya(pasien) }));
