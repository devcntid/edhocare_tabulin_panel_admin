import { errorApp } from "@/lib/app-api";
import { pdfBuktiDariToken } from "@/lib/services/bukti";

type Ctx = { params: Promise<{ id: string }> };

/** Receipt download link from E-09: authorised by the signed token in the URL, not by the Bearer header. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const { nama, isi } = await pdfBuktiDariToken((await ctx.params).id, new URL(req.url).searchParams.get("token"));
    return new Response(new Uint8Array(isi), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nama}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorApp(e);
  }
}
