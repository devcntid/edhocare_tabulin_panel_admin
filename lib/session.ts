import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import type { Peran } from "@/lib/permissions";

export const SESSION_COOKIE = "tabulin_session";
const MAX_AGE = 60 * 60 * 8;

export type Pengguna = { id: number; email: string; nama: string; peran: Peran };

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (min 32 chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(uid: number) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(String(uid)).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
}

export async function verifySession(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const id = Number(payload.sub);
    return Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(uid: number) {
  (await cookies()).set(SESSION_COOKIE, await signSession(uid), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Current admin from the cookie, re-checked against the DB so deactivation takes effect immediately. */
export async function getCurrentUser(): Promise<Pengguna | null> {
  const uid = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const { rows } = await pool.query("SELECT id, email, nama, peran FROM pengguna_admin WHERE id = $1 AND aktif", [uid]);
  return rows[0] ?? null;
}
