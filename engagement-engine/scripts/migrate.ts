/**
 * Applies db/migrations/*.sql in order, once each, inside a transaction per file.
 * Usage: DATABASE_URL=postgres://… npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { connectionString, sslOptions } from "../src/lib/db/ssl";

export async function migrate(databaseUrl: string, log = console.log) {
  const client = new Client({ connectionString: connectionString(databaseUrl), ssl: sslOptions() });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const dir = path.resolve(process.cwd(), "db/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ name: string }>("select name from schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        log(`applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("migrate")) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  migrate(url).then(
    () => console.log("migrations up to date"),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
