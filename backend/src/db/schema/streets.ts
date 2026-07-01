import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { districts } from "./districts";

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
  status: streetStatusEnum("status").default("not_assigned"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Street = typeof streets.$inferSelect;
export type NewStreet = typeof streets.$inferInsert;
