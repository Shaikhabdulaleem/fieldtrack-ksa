import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar"),
  regionEn: text("region_en"),
  regionAr: text("region_ar"),
  centerLat: text("center_lat"),
  centerLng: text("center_lng"),
  estimatedNamedStreets: integer("estimated_named_streets").default(0),
  targetDays: integer("target_days"),
  targetLeadsPerDriver: integer("target_leads_per_driver"),
  maxStreetsPerDriver: integer("max_streets_per_driver"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;
