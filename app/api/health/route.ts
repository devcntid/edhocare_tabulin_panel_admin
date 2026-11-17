import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
    return Response.json({ ok: true, migrations: rows[0].n });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
