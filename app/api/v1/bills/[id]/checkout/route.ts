import { appHandler } from "@/lib/app-api";
import { checkoutTagihan } from "@/lib/services/gateway";

// Creates a Midtrans Sandbox VA charge for the bill; the patient pays to the returned VA number. The body is optional ({ "bank": "bca" } by default).
export const POST = appHandler<{ params: Promise<{ id: string }> }>(async (req, pasien, ctx) => ({
  status: 201,
  body: await checkoutTagihan(pasien, (await ctx.params).id, await req.json().catch(() => ({}))),
}));
