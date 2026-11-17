import { SignJWT, jwtVerify } from "jose";

// Patient-app access token (stand-in for the Edelweiss Portal Pasien login, contract G-01).
// Swap `verifikasiTokenPasien` when Edelweiss provides its own token; nothing else depends on how the token is made.
const AUDIENCE = "tabulin-pasien";
export const TOKEN_PASIEN_DETIK = 60 * 60 * 24;

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (min 32 chars)");
  return new TextEncoder().encode(s);
}

export async function buatTokenPasien(noRm: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(noRm).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${TOKEN_PASIEN_DETIK}s`).sign(key());
}

// Receipt download link (contract BKT-03/05): a short-lived signed token in the URL, so the app can save/share the file without the Bearer header.
const AUDIENCE_BUKTI = "tabulin-bukti";
export const TOKEN_BUKTI_DETIK = 15 * 60;

export async function buatTokenBukti(noRm: string, nomorTransaksi: string) {
  return new SignJWT({ trx: nomorTransaksi }).setProtectedHeader({ alg: "HS256" }).setSubject(noRm).setAudience(AUDIENCE_BUKTI).setIssuedAt().setExpirationTime(`${TOKEN_BUKTI_DETIK}s`).sign(key());
}

/** Returns { noRm, nomorTransaksi } for a valid receipt token, else null. */
export async function verifikasiTokenBukti(token: string): Promise<{ noRm: string; nomorTransaksi: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], audience: AUDIENCE_BUKTI });
    return payload.sub && typeof payload.trx === "string" ? { noRm: payload.sub, nomorTransaksi: payload.trx } : null;
  } catch {
    return null;
  }
}

/** Returns the patient's No. RM, or null if the token is missing, invalid or expired. */
export async function verifikasiTokenPasien(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], audience: AUDIENCE });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
