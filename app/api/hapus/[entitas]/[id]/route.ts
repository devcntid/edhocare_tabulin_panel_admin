import { handler } from "@/lib/api";
import { hapusData } from "@/lib/services/hapus";

type Ctx = { params: Promise<{ entitas: string; id: string }> };

// Permission is checked per entity inside hapusData (each kind has its own role rule).
export const DELETE = handler<Ctx>("lihat", async (_req, user, ctx) => {
  const { entitas, id } = await ctx.params;
  await hapusData(entitas, decodeURIComponent(id), user.peran, user.id);
  return { ok: true };
});
