import { pgTable, uuid, text, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { zones } from "./zones";

export const districts = pgTable("districts", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  zoneId: uuid("zone_id").references(() => zones.id),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar"),
  centerLat: numeric("center_lat", { precision: 10, scale: 7 }),
  centerLng: numeric("center_lng", { precision: 10, scale: 7 }),
  boundary: jsonb("boundary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type District = typeof districts.$inferSelect;
export type NewDistrict = typeof districts.$inferInsert;
