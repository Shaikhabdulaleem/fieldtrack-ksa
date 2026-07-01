CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'city_manager', 'driver', 'client');--> statement-breakpoint
CREATE TYPE "public"."street_status" AS ENUM('not_assigned', 'assigned', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."construction_phase" AS ENUM('just_digging_started', 'foundation_phase', 'first_floor_starting', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'reviewed', 'approved', 'rejected', 'sent_to_client');--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"region_en" text,
	"region_ar" text,
	"center_lat" text,
	"center_lng" text,
	"estimated_named_streets" integer DEFAULT 0,
	"target_days" integer,
	"target_leads_per_driver" integer,
	"max_streets_per_driver" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"role" "user_role" NOT NULL,
	"iqama_number" text,
	"car_plate_number" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"zone_id" uuid,
	"name_en" text NOT NULL,
	"name_ar" text,
	"center_lat" numeric(10, 7),
	"center_lng" numeric(10, 7),
	"boundary" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "streets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"district_id" uuid,
	"name_en" text,
	"name_ar" text,
	"osm_id" text,
	"status" "street_status" DEFAULT 'not_assigned',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"driver_id" uuid,
	"zone_id" uuid,
	"district_id" uuid,
	"street_id" uuid,
	"assigned_by" uuid,
	"assigned_date" date DEFAULT now(),
	"status" "street_status" DEFAULT 'assigned',
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"skipped_reason" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"driver_id" uuid,
	"street_id" uuid,
	"district_id" uuid,
	"zone_id" uuid,
	"site_name" text,
	"plot_number" text,
	"phase" "construction_phase" NOT NULL,
	"location_lat" numeric(10, 7) NOT NULL,
	"location_lng" numeric(10, 7) NOT NULL,
	"gps_accuracy_meters" numeric(6, 2),
	"nearest_landmark" text,
	"owner_name" text,
	"contractor_name" text,
	"phone_number" text,
	"project_name" text,
	"engineer_name" text,
	"notes" text,
	"status" "lead_status" DEFAULT 'new',
	"quality_score" integer DEFAULT 0,
	"duplicate_risk" text DEFAULT 'low',
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"photo_type" text NOT NULL,
	"storage_url" text NOT NULL,
	"gps_lat" numeric(10, 7),
	"gps_lng" numeric(10, 7),
	"watermark_text" text,
	"blur_score" numeric(5, 2),
	"uploaded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_location_pings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"city_id" uuid,
	"driver_id" uuid,
	"location_lat" numeric(10, 7) NOT NULL,
	"location_lng" numeric(10, 7) NOT NULL,
	"speed_kmh" numeric(6, 2),
	"accuracy_meters" numeric(6, 2),
	"battery_percent" integer,
	"recorded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"city_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"city_id" uuid,
	"checkin_date" date DEFAULT now(),
	"checkin_lat" numeric(10, 7),
	"checkin_lng" numeric(10, 7),
	"checkin_accuracy" integer,
	"selfie_url" text,
	"odometer_start" integer,
	"odometer_start_photo" text,
	"fuel_start" text,
	"fuel_start_photo" text,
	"checkin_at" timestamp with time zone DEFAULT now(),
	"odometer_end" integer,
	"odometer_end_photo" text,
	"fuel_end" text,
	"fuel_end_photo" text,
	"checkout_lat" numeric(10, 7),
	"checkout_lng" numeric(10, 7),
	"checkout_at" timestamp with time zone,
	"km_driven" integer
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streets" ADD CONSTRAINT "streets_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streets" ADD CONSTRAINT "streets_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_photos" ADD CONSTRAINT "lead_photos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_pings" ADD CONSTRAINT "driver_location_pings_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_pings" ADD CONSTRAINT "driver_location_pings_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_checkins" ADD CONSTRAINT "driver_checkins_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_checkins" ADD CONSTRAINT "driver_checkins_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;