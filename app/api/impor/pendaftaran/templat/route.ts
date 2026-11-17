import { ApiError, errorResponse } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { templatImpor } from "@/lib/services/impor";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "BELUM_LOGIN", "Silakan login terlebih dahulu.");
    if (!can(user.peran, "verifikasi")) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
    return new Response(templatImpor(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="templat-impor-pendaftaran.csv"', "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
