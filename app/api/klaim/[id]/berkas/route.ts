import { ApiError, errorResponse, idParam, type IdCtx } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { berkasKlaim } from "@/lib/services/klaim";

/** Admin view of the transfer proof uploaded with a claim. */
export async function GET(_req: Request, ctx: IdCtx) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "BELUM_LOGIN", "Silakan login terlebih dahulu.");
    if (!can(user.peran, "lihat")) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
    const b = await berkasKlaim(await idParam(ctx));
    return new Response(new Uint8Array(b.isi), {
      headers: { "Content-Type": b.tipe, "Content-Disposition": `inline; filename="${b.nama}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
