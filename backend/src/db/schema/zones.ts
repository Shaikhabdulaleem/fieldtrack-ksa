import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { cities } from "./cities";

export const zones = pgTable("zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Zone = typeof zones.$inferSelect;
export type NewZone = typeof zones.$inferInsert;
