import { handler, idParam, type IdCtx } from "@/lib/api";
import { detail } from "@/lib/services/pendaftaran";

export const dynamic = "force-dynamic";

export const GET = handler<IdCtx>("lihat", async (_req, _u, ctx) => detail(await idParam(ctx)));
