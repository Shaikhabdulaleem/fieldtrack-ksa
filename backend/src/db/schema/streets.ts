import { pgTable, uuid, text, numeric, jsonb, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cities } from "./cities";
import { districts } from "./districts";
import { surveyZones } from "./surveyZones";

export const streetStatusEnum = pgEnum("street_status", [
  "not_assigned",
  "assigned",
  "in_progress",
  "completed",
  "skipped",
  // NEW - represent streets paused during Driver deactivation separately from unassigned work.
  "on_hold",
]);

export const streets = pgTable("streets", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  districtId: uuid("district_id").references(() => districts.id),
  nameEn: text("name_en"),
  nameAr: text("name_ar"),
  osmId: text("osm_id"),
  // Road length in km, computed from OSM way geometry (turf.length). NULL means
  // no geometry has been ingested yet for this street — maps to "no road data" gray.
  lengthKm: numeric("length_km", { precision: 6, scale: 3 }),
  // Polyline geometry, [lat,lng][] pairs — same convention as districts.boundary.
  geometry: jsonb("geometry"),
  surveyZoneId: uuid("survey_zone_id").references(() => surveyZones.id, { onDelete: "set null" }),
  status: streetStatusEnum("status").default("not_assigned"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  // Prevents duplicate rows on repeated OSM ingestion runs. Partial (osm_id can
  // be NULL for legacy/manually-created streets that predate osmId tracking).
  uniqueIndex("streets_city_osm_uidx").on(t.cityId, t.osmId).where(sql`${t.osmId} is not null`),
]);

export type Street = typeof streets.$inferSelect;
export type NewStreet = typeof streets.$inferInsert;
