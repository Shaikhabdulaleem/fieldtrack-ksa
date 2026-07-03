import { pgTable, uuid, date, timestamp, text } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { users } from "./users";
import { zones } from "./zones";
import { districts } from "./districts";
import { streets, streetStatusEnum } from "./streets";
import { surveyZones } from "./surveyZones";

export const driverAssignments = pgTable("driver_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  driverId: uuid("driver_id").references(() => users.id),
  zoneId: uuid("zone_id").references(() => zones.id),
  districtId: uuid("district_id").references(() => districts.id),
  streetId: uuid("street_id").references(() => streets.id),
  // Links this per-street assignment row to its km-capacity-based survey zone
  // (District-Based Driver Survey Coverage Planner). NULL for assignments made
  // via the pre-existing street-count-based assign-district/auto-plan flows.
  surveyZoneId: uuid("survey_zone_id").references(() => surveyZones.id, { onDelete: "set null" }),
  assignedBy: uuid("assigned_by").references(() => users.id),
  assignedDate: date("assigned_date").defaultNow(),
  status: streetStatusEnum("status").default("assigned"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  skippedReason: text("skipped_reason"),
});

export type DriverAssignment = typeof driverAssignments.$inferSelect;
export type NewDriverAssignment = typeof driverAssignments.$inferInsert;
