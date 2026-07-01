/**
 * Production-safe migration runner.
 *
 * - Development:  `npm run migrate`         → drizzle-kit push (fast, no files)
 * - Production:   `npm run migrate:generate` → generate SQL migration files
 *                 `npm run migrate:run`      → apply them safely via this script
 *
 * Never use `drizzle-kit push` against a production database — it diffs
 * and mutates directly with no rollback. Always use generated migration files.
 */
import "../config/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env";
import path from "path";

async function runMigrations() {
  console.log("🔄 Running database migrations…");
  console.log(`   DATABASE_URL: ${env.DATABASE_URL.replace(/:([^:@]+)@/, ":***@")}`);

  // Use a single connection for migrations (not the pool)
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder = path.join(__dirname, "../../drizzle");

  try {
    await migrate(db, { migrationsFolder });
    console.log("✅ Migrations complete");
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
