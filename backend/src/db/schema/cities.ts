import { pgTable, uuid, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

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
  // Coverage Planning Calculator inputs (District-Based Driver Survey Coverage Planner)
  petrolPerDriverPerDay: numeric("petrol_per_driver_per_day", { precision: 6, scale: 2 }).default("50"),
  petrolPricePerLiter: numeric("petrol_price_per_liter", { precision: 6, scale: 2 }).default("2.18"),
  avgCarMileageKmPerLiter: numeric("avg_car_mileage_km_per_liter", { precision: 6, scale: 2 }).default("14"),
  surveyEfficiencyPct: integer("survey_efficiency_pct").default(60),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;
