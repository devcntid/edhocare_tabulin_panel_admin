import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { terimaNotifikasiFaspay } from "@/lib/services/gateway";

/** Webhook from the payment gateway (Faspay). Not authenticated by a session: it is signed (HMAC), and the transaction is read back from the gateway before anything is credited. */
export async function POST(req: Request) {
  try {
    const isi = await req.text(); // the signature covers the raw text, so it must not be re-serialized
    return NextResponse.json({ data: await terimaNotifikasiFaspay(isi, req.headers.get("x-gateway-timestamp"), req.headers.get("x-gateway-signature")) });
  } catch (e) {
    return errorResponse(e);
  }
}
