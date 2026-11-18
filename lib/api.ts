import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser, type Pengguna } from "@/lib/session";
import { can, type Aksi } from "@/lib/permissions";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  TIDAK_DITEMUKAN: 404,
  STATUS_TIDAK_VALID: 409,
  TAGIHAN_SUDAH_LUNAS: 409,
  MENUNGGU_GATEWAY: 409,
  TAGIHAN_SUDAH_ADA: 409,
  VA_DUPLIKAT: 409,
  KOREKSI_TIDAK_VALID: 409,
  JADWAL_HABIS: 409,
  KLAIM_SUDAH_ADA: 409,
  KLAIM_TIDAK_VALID: 409,
};

type PgLike = { code?: string; message?: string; constraint?: string };

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of e.issues) fields[i.path.join(".") || "_"] ??= i.message;
    return new ApiError(422, "VALIDASI", "Data tidak valid.", fields);
  }
  const pg = e as PgLike;
  if (pg?.code === "P0001" && pg.message) {
    const m = /^([A-Z_]+): ?([\s\S]*)$/.exec(pg.message);
    if (m) return new ApiError(STATUS_BY_CODE[m[1]] ?? 422, m[1], m[2] || m[1]);
  }
  if (pg?.code === "23505") return new ApiError(409, "DUPLIKAT", "Data sudah ada.");
  console.error(e);
  return new ApiError(500, "SERVER", "Terjadi kesalahan pada server.");
}

export function errorResponse(e: unknown) {
  const a = toApiError(e);
  return NextResponse.json({ error: { code: a.code, message: a.message, fields: a.fields } }, { status: a.status });
}

/** Wraps a mutating/reading handler: same-origin check, session, permission, error envelope. */
export function handler<C = unknown>(aksi: Aksi, fn: (req: Request, user: Pengguna, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      if (req.method !== "GET") {
        const origin = req.headers.get("origin");
        if (origin && new URL(origin).host !== req.headers.get("host")) throw new ApiError(403, "ASAL_DITOLAK", "Permintaan ditolak.");
      }
      const user = await getCurrentUser();
      if (!user) throw new ApiError(401, "BELUM_LOGIN", "Silakan login terlebih dahulu.");
      if (!can(user.peran, aksi)) throw new ApiError(403, "DILARANG", "Anda tidak memiliki akses untuk aksi ini.");
      return NextResponse.json({ data: await fn(req, user, ctx) });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export type IdCtx = { params: Promise<{ id: string }> };

export async function idParam(ctx: IdCtx): Promise<number> {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(404, "TIDAK_DITEMUKAN", "Data tidak ditemukan.");
  return id;
}

export async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "BODY_TIDAK_VALID", "Body harus berupa JSON.");
  }
}
