import { z } from "zod";
import { handler, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { panggil } from "@/lib/services/pendaftaran";

const schema = z.object({ alasan: z.string().trim().min(1, "Alasan wajib diisi.").max(500) });

export const POST = handler<IdCtx>("keuangan", async (req, user, ctx) => {
  const { alasan } = schema.parse(await jsonBody(req));
  const k = await panggil("tolak_klaim", [await idParam(ctx), alasan, user.id]);
  return { id: k.id, status: k.status };
});
