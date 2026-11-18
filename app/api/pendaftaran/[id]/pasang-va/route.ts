import { z } from "zod";
import { handler, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { vaBawaan } from "@/lib/services/gateway";
import { panggil } from "@/lib/services/pendaftaran";

const schema = z.object({ no_va: z.string().trim().optional() });

export const POST = handler<IdCtx>("keuangan", async (req, user, ctx) => {
  const { no_va } = schema.parse(await jsonBody(req).catch(() => ({})));
  return panggil("pasang_va", [await idParam(ctx), no_va || (await vaBawaan()), user.id]);
});
