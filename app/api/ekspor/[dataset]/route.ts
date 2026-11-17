import { ApiError, errorResponse } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { dataset, ekspor } from "@/lib/services/ekspor";
import { today } from "@/lib/services/pendaftaran";

export const dynamic = "force-dynamic";

/** GET /api/ekspor/{dataset}?format=csv|pdf&q=...&{filter}=...  Same search and filter as the page the button is on. */
export async function GET(req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "BELUM_LOGIN", "Silakan login terlebih dahulu.");
    const nama = (await ctx.params).dataset;
    const d = dataset(nama);
    if (!can(user.peran, d.izin)) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
    const u = new URL(req.url).searchParams;
    const f = await ekspor(nama, {
      format: u.get("format") ?? "csv", q: u.get("q") ?? undefined, filter: d.filter ? u.get(d.filter) ?? undefined : undefined,
      adminId: user.id, hariIni: await today(),
    });
    return new Response(new Uint8Array(f.isi), {
      headers: { "Content-Type": f.tipe, "Content-Disposition": `attachment; filename="${f.nama}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
