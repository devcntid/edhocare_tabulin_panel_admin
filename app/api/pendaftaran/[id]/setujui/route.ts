import { handler, idParam, type IdCtx } from "@/lib/api";
import { panggil } from "@/lib/services/pendaftaran";

export const POST = handler<IdCtx>("verifikasi", async (_req, user, ctx) => panggil("setujui_pendaftaran", [await idParam(ctx), user.id]));
