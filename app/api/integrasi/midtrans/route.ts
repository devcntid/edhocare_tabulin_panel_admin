import { NextResponse } from "next/server";
import { errorResponse, jsonBody } from "@/lib/api";
import { terimaNotifikasiMidtrans } from "@/lib/services/gateway";

/** Midtrans HTTP notification (callback). Not authenticated by a session: the status of the order is asked back from Midtrans (see ambilStatusTransaksi). */
export async function POST(req: Request) {
  try {
    return NextResponse.json({ data: await terimaNotifikasiMidtrans(await jsonBody(req)) });
  } catch (e) {
    return errorResponse(e);
  }
}
