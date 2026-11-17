import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         nama text PRIMARY KEY, checksum text NOT NULL, diterapkan_pada timestamptz NOT NULL DEFAULT now())`,
    );
    const dir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const done = new Map(
      (await client.query("SELECT nama, checksum FROM schema_migrations")).rows.map((r) => [r.nama, r.checksum] as const),
    );
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      const sum = createHash("sha256").update(sql).digest("hex");
      if (done.has(f)) {
        if (done.get(f) !== sum) throw new Error(`Migration ${f} was modified after being applied`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (nama, checksum) VALUES ($1, $2)", [f, sum]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
      console.log(`applied ${f}`);
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
