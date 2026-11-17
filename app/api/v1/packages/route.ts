import { appHandler } from "@/lib/app-api";
import { paketKatalog } from "@/lib/services/app";

export const GET = appHandler(async (req) => ({ body: await paketKatalog(new URL(req.url).searchParams.get("kode_faskes") ?? undefined) }));
