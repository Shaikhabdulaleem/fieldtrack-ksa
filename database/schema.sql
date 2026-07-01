-- FieldTrack KSA — Reference SQL Schema
-- ══════════════════════════════════════════════════════════════════════════════
-- THIS FILE IS FOR REFERENCE / DOCUMENTATION ONLY.
-- The authoritative schema is defined in backend/src/db/schema/*.ts (Drizzle ORM).
--
-- To create or update the database:
--   cd backend
--   npm run migrate           # (dev) drizzle-kit push — fast, direct sync
--   npm run migrate:generate  # (prod) generate SQL migration files in drizzle/
--   npm run migrate:run       # (prod) apply generated migrations safely
--
-- Requirements: PostgreSQL 14+ with the pgcrypto extension.
-- PostGIS is NOT required by the ORM schema (locations stored as numeric lat/lng).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role         AS ENUM ('super_admin', 'city_manager', 'driver', 'client');
CREATE TYPE driver_status     AS ENUM ('active', 'idle', 'offline', 'disabled');
CREATE TYPE street_status     AS ENUM ('not_assigned', 'assigned', 'in_progress', 'completed', 'skipped');
CREATE TYPE lead_status       AS ENUM ('new', 'reviewed', 'approved', 'rejected', 'sent_to_client');
CREATE TYPE construction_phase AS ENUM ('just_digging_started', 'foundation_phase', 'first_floor_starting', 'other');

-- ── Core Geography ────────────────────────────────────────────────────────────

CREATE TABLE cities (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en                 TEXT        NOT NULL,
  name_ar                 TEXT,
  region_en               TEXT,
  region_ar               TEXT,
  center_lat              NUMERIC(10,7),
  center_lng              NUMERIC(10,7),
  estimated_named_streets INTEGER     DEFAULT 0,
  is_active               BOOLEAN     DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE zones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    UUID        NOT NULL REFERENCES cities(id),
  name_en    TEXT        NOT NULL,
  name_ar    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE districts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    UUID        NOT NULL REFERENCES cities(id),
  zone_id    UUID        REFERENCES zones(id),
  name_en    TEXT        NOT NULL,
  name_ar    TEXT,
  -- Centroid coordinates used for geographic clustering in auto-plan
  center_lat NUMERIC(10,7),
  center_lng NUMERIC(10,7),
  -- District boundary as a JSON array of [lat, lng] coordinate pairs
  -- e.g. [[21.548,39.165],[21.548,39.182],[21.537,39.182],[21.537,39.165]]
  boundary   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE streets (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     UUID          NOT NULL REFERENCES cities(id),
  district_id UUID          REFERENCES districts(id),
  name_en     TEXT,
  name_ar     TEXT,
  osm_id      TEXT,
  status      street_status DEFAULT 'not_assigned',
  created_at  TIMESTAMPTZ   DEFAULT now()
);

-- ── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id          UUID      REFERENCES cities(id),
  full_name        TEXT      NOT NULL,
  email            TEXT      UNIQUE,
  phone            TEXT,
  password_hash    TEXT,
  role             user_role NOT NULL,
  iqama_number     TEXT,         -- Saudi national ID / Iqama for drivers
  car_plate_number TEXT,         -- Vehicle plate number for drivers
  is_active        BOOLEAN   DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Driver Operations ────────────────────────────────────────────────────────

CREATE TABLE driver_assignments (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       UUID          NOT NULL REFERENCES cities(id),
  driver_id     UUID          REFERENCES users(id),
  zone_id       UUID          REFERENCES zones(id),
  district_id   UUID          REFERENCES districts(id),
  street_id     UUID          REFERENCES streets(id),
  assigned_by   UUID          REFERENCES users(id),
  assigned_date DATE          DEFAULT CURRENT_DATE,
  status        street_status DEFAULT 'assigned',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  skipped_reason TEXT
);

-- Daily check-in / check-out records for each driver shift
CREATE TABLE driver_checkins (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            UUID        NOT NULL REFERENCES users(id),
  city_id              UUID        REFERENCES cities(id),
  checkin_date         DATE        DEFAULT CURRENT_DATE,

  -- Check-in
  checkin_lat          NUMERIC(10,7),
  checkin_lng          NUMERIC(10,7),
  checkin_accuracy     INTEGER,          -- GPS accuracy in metres
  selfie_url           TEXT,
  odometer_start       INTEGER,
  odometer_start_photo TEXT,
  fuel_start           TEXT,
  fuel_start_photo     TEXT,
  checkin_at           TIMESTAMPTZ DEFAULT now(),

  -- Check-out
  odometer_end         INTEGER,
  odometer_end_photo   TEXT,
  fuel_end             TEXT,
  fuel_end_photo       TEXT,
  checkout_lat         NUMERIC(10,7),
  checkout_lng         NUMERIC(10,7),
  checkout_at          TIMESTAMPTZ,
  km_driven            INTEGER
);

-- GPS ping stream — one row per location update from a driver's device
CREATE TABLE driver_location_pings (
  id              BIGSERIAL   PRIMARY KEY,
  city_id         UUID        REFERENCES cities(id),
  driver_id       UUID        REFERENCES users(id),
  location_lat    NUMERIC(10,7) NOT NULL,
  location_lng    NUMERIC(10,7) NOT NULL,
  speed_kmh       NUMERIC(6,2),
  accuracy_meters NUMERIC(6,2),
  battery_percent INTEGER,
  recorded_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_driver_location_pings_driver_time ON driver_location_pings(driver_id, recorded_at DESC);
CREATE INDEX idx_driver_location_pings_city_time   ON driver_location_pings(city_id,   recorded_at DESC);

-- ── Leads ────────────────────────────────────────────────────────────────────

CREATE TABLE leads (
  id                 UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id            UUID               NOT NULL REFERENCES cities(id),
  driver_id          UUID               REFERENCES users(id),
  street_id          UUID               REFERENCES streets(id),
  district_id        UUID               REFERENCES districts(id),
  zone_id            UUID               REFERENCES zones(id),
  site_name          TEXT,
  plot_number        TEXT,
  phase              construction_phase NOT NULL,
  location_lat       NUMERIC(10,7)      NOT NULL,
  location_lng       NUMERIC(10,7)      NOT NULL,
  gps_accuracy_meters NUMERIC(6,2),    -- GPS accuracy when lead was captured
  nearest_landmark   TEXT,
  owner_name         TEXT,
  contractor_name    TEXT,
  phone_number       TEXT,
  project_name       TEXT,
  engineer_name      TEXT,
  notes              TEXT,
  status             lead_status        DEFAULT 'new',
  quality_score      INTEGER            DEFAULT 0,   -- 0–100 computed from photos + GPS
  duplicate_risk     TEXT               DEFAULT 'low', -- low / medium / high
  reviewed_by        UUID               REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  reject_reason      TEXT,
  created_at         TIMESTAMPTZ        DEFAULT now(),
  updated_at         TIMESTAMPTZ        DEFAULT now()
);

CREATE INDEX idx_leads_status_created ON leads(status,  created_at DESC);
CREATE INDEX idx_leads_city_created   ON leads(city_id, created_at DESC);

CREATE TABLE lead_photos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID        REFERENCES leads(id) ON DELETE CASCADE,
  photo_type   TEXT        CHECK (photo_type IN ('billboard', 'front', 'side', 'contractor_board', 'selfie_checkin')),
  storage_url  TEXT        NOT NULL,   -- absolute URL (local /uploads/ in dev, S3 in prod)
  gps_lat      NUMERIC(10,7),
  gps_lng      NUMERIC(10,7),
  watermark_text TEXT,
  blur_score   NUMERIC(5,2),           -- Laplacian variance; higher = sharper
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Audit ────────────────────────────────────────────────────────────────────

CREATE TABLE activity_logs (
  id          BIGSERIAL   PRIMARY KEY,
  city_id     UUID        REFERENCES cities(id),
  user_id     UUID        REFERENCES users(id),
  action      TEXT        NOT NULL,   -- e.g. 'lead.approved', 'user.created'
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
