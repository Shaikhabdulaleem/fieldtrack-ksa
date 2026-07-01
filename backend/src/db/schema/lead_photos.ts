import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { leads } from "./leads";

export const leadPhotos = pgTable("lead_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  photoType: text("photo_type").notNull(),
  storageUrl: text("storage_url").notNull(),
  gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }),
  watermarkText: text("watermark_text"),
  blurScore: numeric("blur_score", { precision: 5, scale: 2 }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
});

export type LeadPhoto = typeof leadPhotos.$inferSelect;
export type NewLeadPhoto = typeof leadPhotos.$inferInsert;
