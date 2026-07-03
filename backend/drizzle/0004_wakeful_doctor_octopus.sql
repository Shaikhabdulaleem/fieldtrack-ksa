CREATE TYPE "public"."survey_zone_status" AS ENUM('not_assigned', 'assigned', 'partially_assigned', 'in_progress', 'completed', 'partially_completed', 'rejected_needs_review');--> statement-breakpoint
CREATE TABLE "survey_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"district_id" uuid NOT NULL,
	"label" text NOT NULL,
	"target_km" numeric(6, 2) NOT NULL,
	"assigned_driver_id" uuid,
	"assigned_date" date,
	"status" "survey_zone_status" DEFAULT 'not_assigned' NOT NULL,
	"actual_km" numeric(6, 2),
	"proof_photo_urls" jsonb,
	"proof_video_urls" jsonb,
	"completed_at" timestamp with time zone,
	"verification_notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "petrol_per_driver_per_day" numeric(6, 2) DEFAULT '50';--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "petrol_price_per_liter" numeric(6, 2) DEFAULT '2.18';--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "avg_car_mileage_km_per_liter" numeric(6, 2) DEFAULT '14';--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "survey_efficiency_pct" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "districts" ADD COLUMN "road_km" numeric(8, 3);--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN "length_km" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN "geometry" jsonb;--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN "survey_zone_id" uuid;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD COLUMN "survey_zone_id" uuid;--> statement-breakpoint
ALTER TABLE "survey_zones" ADD CONSTRAINT "survey_zones_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_zones" ADD CONSTRAINT "survey_zones_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_zones" ADD CONSTRAINT "survey_zones_assigned_driver_id_users_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streets" ADD CONSTRAINT "streets_survey_zone_id_survey_zones_id_fk" FOREIGN KEY ("survey_zone_id") REFERENCES "public"."survey_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_survey_zone_id_survey_zones_id_fk" FOREIGN KEY ("survey_zone_id") REFERENCES "public"."survey_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_time_idx" ON "driver_location_pings" USING btree ("driver_id","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "city_time_idx" ON "driver_location_pings" USING btree ("city_id","recorded_at");
-- checkins_driver_date_uidx already exists on the DB (created outside migration
-- tracking during earlier development) — intentionally not recreated here.