import { z } from "zod";
import { handler, jsonBody } from "@/lib/api";
import { buat, buatSchema, daftar } from "@/lib/services/pendaftaran";

export const dynamic = "force-dynamic";

export const GET = handler("lihat", async (req) => {
  const u = new URL(req.url).searchParams;
  const page = z.coerce.number().int().positive().catch(1).parse(u.get("page"));
  return daftar({ q: u.get("q") ?? undefined, status: u.get("status") ?? undefined, page });
});

export const POST = handler("verifikasi", async (req, user) => buat(buatSchema.parse(await jsonBody(req)), user.id));
