import { z } from "zod";
import { handler, idParam, jsonBody, ApiError, type IdCtx } from "@/lib/api";
import { detail, konfig, panggil } from "@/lib/services/pendaftaran";
import { nominalTagihan } from "@/lib/services/tabungan";

// Body is optional: period defaults to the current/next period and the nominal is computed server-side (D-02).
const schema = z.object({ periode: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode tidak valid.").optional() });

export const POST = handler<IdCtx>("keuangan", async (req, user, ctx) => {
  const id = await idParam(ctx);
  const { periode } = schema.parse(await jsonBody(req).catch(() => ({})));
  const d = await detail(id);
  // Registrations with an installment schedule always issue the next installment; the period cannot be chosen.
  if (d.pendaftaran.jumlah_cicilan) return panggil("terbitkan_cicilan", [id, user.id]);
  if (!d.tagihan_baru) throw new ApiError(409, "STATUS_TIDAK_VALID", "Pendaftaran belum aktif.");
  const per = periode ?? d.tagihan_baru.periode;
  const cfg = await konfig();
  const nominal = nominalTagihan(d.pendaftaran, d.pendaftaran.jenis_rencana, per, d.pendaftaran.saldo, d.tagihan, cfg.hari);
  return panggil("terbitkan_tagihan_bulanan", [id, per, nominal, user.id]);
});
