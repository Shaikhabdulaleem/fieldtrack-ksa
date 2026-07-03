import { pgTable, uuid, text, numeric, date, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { districts } from "./districts";
import { users } from "./users";

// Capacity-based sub-division of ONE district's streets for driver-day-sized
// assignment — distinct from the `zones` table (a geographic label like
// "North Jeddah" grouping districts). Do not confuse the two.
export const surveyZoneStatusEnum = pgEnum("survey_zone_status", [
  "not_assigned",
  "assigned",
  "partially_assigned",
  "in_progress",
  "completed",
  "partially_completed",
  "rejected_needs_review",
]);

export const surveyZones = pgTable("survey_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  districtId: uuid("district_id").notNull().references(() => districts.id),
  label: text("label").notNull(),
  targetKm: numeric("target_km", { precision: 6, scale: 2 }).notNull(),
  assignedDriverId: uuid("assigned_driver_id").references(() => users.id),
  assignedDate: date("assigned_date"),
  status: surveyZoneStatusEnum("status").default("not_assigned").notNull(),
  actualKm: numeric("actual_km", { precision: 6, scale: 2 }),
  proofPhotoUrls: jsonb("proof_photo_urls"),
  proofVideoUrls: jsonb("proof_video_urls"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  verificationNotes: text("verification_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type SurveyZone = typeof surveyZones.$inferSelect;
export type NewSurveyZone = typeof surveyZones.$inferInsert;
