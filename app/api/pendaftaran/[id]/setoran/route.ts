import { handler, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { konfirmasiSetoranManual } from "@/lib/services/pendaftaran";

// Manual confirmation of a bank-transfer deposit (tanggal_bayar, nominal, optional tagihan_id). Same ledger function as the API path.
export const POST = handler<IdCtx>("keuangan", async (req, user, ctx) => konfirmasiSetoranManual(await idParam(ctx), await jsonBody(req), user.id));
