import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, toApiError } from "@/lib/api";
import { pool } from "@/lib/db";
import { verifikasiTokenPasien } from "@/lib/pasien-token";

export type PasienApp = { no_rm: string; nama: string; no_hp: string };

// Contract §4.0 uses English codes for the generic errors; admin handlers keep the Indonesian ones.
const KODE_APP: Record<string, string> = {
  VALIDASI: "VALIDATION_ERROR", TIDAK_DITEMUKAN: "NOT_FOUND", BELUM_LOGIN: "UNAUTHORIZED", SERVER: "INTERNAL_ERROR", TIDAK_DIKONFIGURASI: "SERVICE_UNAVAILABLE",
};

export function errorApp(e: unknown) {
  const a = toApiError(e);
  return NextResponse.json({ error: { code: KODE_APP[a.code] ?? a.code, message: a.message, ...(a.fields ? { fields: a.fields } : {}) } }, { status: a.status });
}

/** Handler for the patient-app endpoints: Bearer patient token, contract error shape, unwrapped JSON body. */
export function appHandler<C = unknown>(fn: (req: Request, pasien: PasienApp, ctx: C) => Promise<{ status?: number; body?: unknown }>) {
  return async (req: Request, ctx: C) => {
    try {
      const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
      const noRm = token ? await verifikasiTokenPasien(token) : null;
      const pasien = noRm ? ((await pool.query("SELECT no_rm, nama, no_hp FROM pasien WHERE no_rm = $1", [noRm])).rows[0] as PasienApp | undefined) : undefined;
      if (!pasien) throw new ApiError(401, "BELUM_LOGIN", "Sesi tidak valid. Silakan masuk kembali.");
      const r = await fn(req, pasien, ctx);
      return r.body === undefined ? new NextResponse(null, { status: r.status ?? 204 }) : NextResponse.json(r.body, { status: r.status ?? 200 });
    } catch (e) {
      return errorApp(e);
    }
  };
}

export async function bodyJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "BODY_TIDAK_VALID", "Body harus berupa JSON.");
  }
}

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type Halaman = { limit: number; offset: number };

/** Opaque cursor = base64url({"offset":n}) (same shape as the contract's example). */
export function halaman(url: URL): Halaman {
  const { limit, cursor } = pageSchema.parse(Object.fromEntries(url.searchParams));
  let offset = 0;
  if (cursor) {
    try {
      const o = JSON.parse(Buffer.from(cursor, "base64url").toString()).offset;
      if (!Number.isSafeInteger(o) || o < 0) throw new Error();
      offset = o;
    } catch {
      throw new ApiError(422, "VALIDASI", "Data tidak valid.", { cursor: "Cursor tidak valid." });
    }
  }
  return { limit, offset };
}

/** `rows` was fetched with limit + 1. */
export function potong<T>(rows: T[], h: Halaman): { items: T[]; next_cursor: string | null } {
  const items = rows.slice(0, h.limit);
  return { items, next_cursor: rows.length > h.limit ? Buffer.from(JSON.stringify({ offset: h.offset + h.limit })).toString("base64url") : null };
}
