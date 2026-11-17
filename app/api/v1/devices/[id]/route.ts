import { appHandler } from "@/lib/app-api";
import { hapusPerangkat } from "@/lib/services/app";

export const DELETE = appHandler<{ params: Promise<{ id: string }> }>(async (_req, pasien, ctx) => {
  await hapusPerangkat(pasien, (await ctx.params).id);
  return { status: 204 };
});
