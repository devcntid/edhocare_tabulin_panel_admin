import { Pool, types } from "pg";

// int8 -> number (guarded), numeric -> number, DATE -> 'YYYY-MM-DD' string (avoids timezone day shifts)
types.setTypeParser(20, (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`int8 out of safe range: ${v}`);
  return n;
});
types.setTypeParser(1700, (v) => Number(v));
types.setTypeParser(1082, (v) => v);
// timestamptz -> ISO string (serializable for client components)
types.setTypeParser(1184, (v) => new Date(v).toISOString());

export function createPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url, options: "-c timezone=Asia/Jakarta" });
}

// Reuse one pool across dev hot reloads.
const globalForPool = globalThis as unknown as { __tabulinPool?: Pool };
export const pool: Pool = (globalForPool.__tabulinPool ??= createPool());
