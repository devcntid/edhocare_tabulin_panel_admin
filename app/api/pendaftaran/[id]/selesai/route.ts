import { handler, idParam, type IdCtx } from "@/lib/api";
import { panggil } from "@/lib/services/pendaftaran";

export const POST = handler<IdCtx>("keuangan", async (_req, user, ctx) => panggil("tandai_selesai", [await idParam(ctx), user.id]));
