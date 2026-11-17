import { ApiError } from "@/lib/api";
import { appHandler, halaman, potong } from "@/lib/app-api";
import { ajukanKlaim, daftarKlaim } from "@/lib/services/klaim";

// E-15
export const GET = appHandler(async (req, pasien) => {
  const url = new URL(req.url);
  const h = halaman(url);
  return { body: potong(await daftarKlaim(pasien, url, h), h) };
});

// E-13 (multipart/form-data, optional Idempotency-Key)
export const POST = appHandler(async (req, pasien) => {
  const form = await req.formData().catch(() => {
    throw new ApiError(422, "VALIDASI", "Data tidak valid.", { _: "Body harus multipart/form-data." });
  });
  return { status: 201, body: await ajukanKlaim(pasien, form, req.headers.get("idempotency-key")?.trim().slice(0, 100) || null) };
});
