import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const WEAK_SECRETS = [
  "change-me-to-a-long-random-secret-string",
  "secret",
  "jwt_secret",
  "your_jwt_secret",
];

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .refine(
      (val) => !WEAK_SECRETS.includes(val),
      "JWT_SECRET is a known placeholder — generate a real secret with: openssl rand -hex 64",
    ),
  PORT: z.coerce.number().default(4000),
  // In production this MUST be set to your real frontend origin (e.g. https://app.fieldtrack.sa)
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Supabase Storage ──────────────────────────────────────────────────────
  // Get these from: Supabase Dashboard → Settings → API
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL").min(1, "SUPABASE_URL is required"),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),
  // The bucket you created in Supabase Dashboard → Storage → New Bucket
  SUPABASE_STORAGE_BUCKET: z.string().default("fieldtrack-uploads"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === "production" && env.FRONTEND_URL.includes("localhost")) {
  console.warn("⚠️  WARNING: FRONTEND_URL is pointing to localhost in production. Set it to your real frontend domain.");
}
if (env.NODE_ENV === "production" && env.SUPABASE_URL.includes("localhost")) {
  console.warn("⚠️  WARNING: SUPABASE_URL looks like a local URL in production. Set it to your real Supabase project URL.");
}
