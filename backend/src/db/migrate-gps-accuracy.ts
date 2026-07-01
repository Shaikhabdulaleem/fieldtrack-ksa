import "../config/env";
import postgres from "postgres";
import { env } from "../config/env";

async function run() {
  const client = postgres(env.DATABASE_URL, { max: 1 });

  try {
    console.log("Adding low_accuracy column to driver_location_pings...");
    await client`
      ALTER TABLE driver_location_pings
      ADD COLUMN IF NOT EXISTS low_accuracy boolean NOT NULL DEFAULT false
    `;
    console.log("✅ low_accuracy column added");

    console.log("Creating tracking_alert_acks table...");
    await client`
      CREATE TABLE IF NOT EXISTS tracking_alert_acks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id uuid NOT NULL REFERENCES users(id),
        alert_date date NOT NULL,
        acknowledged_by uuid NOT NULL REFERENCES users(id),
        acknowledged_at timestamptz DEFAULT now(),
        UNIQUE (driver_id, alert_date)
      )
    `;
    console.log("✅ tracking_alert_acks table created");

    console.log("✅ Migration complete");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
