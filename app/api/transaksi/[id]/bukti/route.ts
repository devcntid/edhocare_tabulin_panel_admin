import { ApiError, errorResponse, idParam, type IdCtx } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { pdfBuktiAdmin } from "@/lib/services/bukti";

/** Admin export: receipt PDF of one ledger row. */
export async function GET(_req: Request, ctx: IdCtx) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "BELUM_LOGIN", "Silakan login terlebih dahulu.");
    if (!can(user.peran, "lihat")) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
    const { nama, isi } = await pdfBuktiAdmin(await idParam(ctx));
    return new Response(new Uint8Array(isi), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nama}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
