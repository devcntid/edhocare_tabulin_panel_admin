import { appHandler } from "@/lib/app-api";
import { tagihanDetail } from "@/lib/services/app";

export const GET = appHandler<{ params: Promise<{ id: string }> }>(async (_req, pasien, ctx) => ({ body: await tagihanDetail(pasien, (await ctx.params).id) }));
