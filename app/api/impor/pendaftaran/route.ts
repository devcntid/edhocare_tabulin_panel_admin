import { ApiError, errorResponse } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { IMPOR_MAKS_BYTE, imporPendaftaran } from "@/lib/services/impor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST multipart: file (CSV) and periksa=1 to only validate. All rows are written together or not at all. */
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) throw new ApiError(403, "ASAL_DITOLAK", "Permintaan ditolak.");
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "BELUM_LOGIN", "Silakan login terlebih dahulu.");
    if (!can(user.peran, "verifikasi")) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { file: "Pilih file CSV." });
    if (file.size > IMPOR_MAKS_BYTE) throw new ApiError(422, "VALIDASI", "Data tidak valid.", { file: "File terlalu besar (maksimal 1 MB)." });
    const hasil = await imporPendaftaran(await file.text(), { adminId: user.id, periksa: form?.get("periksa") === "1" });
    return NextResponse.json({ data: hasil });
  } catch (e) {
    return errorResponse(e);
  }
}
