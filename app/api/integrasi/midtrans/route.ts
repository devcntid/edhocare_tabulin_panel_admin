import { NextResponse } from "next/server";
import { errorResponse, jsonBody } from "@/lib/api";
import { terimaNotifikasiMidtrans } from "@/lib/services/gateway";

/** Midtrans HTTP notification (callback). Authenticated by the signature_key in the body, not by a session or Bearer key. */
export async function POST(req: Request) {
  try {
    return NextResponse.json({ data: await terimaNotifikasiMidtrans(await jsonBody(req)) });
  } catch (e) {
    return errorResponse(e);
  }
}
