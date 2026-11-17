import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api";

/** Machine-to-machine auth for the customer app / bank API: `Authorization: Bearer <INTEGRATION_API_KEY>`. */
export function wajibKunciApi(req: Request) {
  const key = process.env.INTEGRATION_API_KEY;
  if (!key || key.length < 24) throw new ApiError(503, "TIDAK_DIKONFIGURASI", "Integrasi belum dikonfigurasi.");
  const got = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(key);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(401, "BELUM_LOGIN", "Kunci API tidak valid.");
}
