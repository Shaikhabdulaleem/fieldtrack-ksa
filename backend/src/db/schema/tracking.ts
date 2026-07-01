import { pgTable, bigserial, uuid, numeric, integer, timestamp, boolean, date, unique, index } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { users } from "./users";

export const driverLocationPings = pgTable("driver_location_pings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  cityId: uuid("city_id").references(() => cities.id),
  driverId: uuid("driver_id").references(() => users.id),
  locationLat: numeric("location_lat", { precision: 10, scale: 7 }).notNull(),
  locationLng: numeric("location_lng", { precision: 10, scale: 7 }).notNull(),
  speedKmh: numeric("speed_kmh", { precision: 6, scale: 2 }),
  accuracyMeters: numeric("accuracy_meters", { precision: 6, scale: 2 }),
  lowAccuracy: boolean("low_accuracy").default(false).notNull(),
  batteryPercent: integer("battery_percent"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  // Fast per-driver history queries (driver detail view, trail replay)
  driverTimeIdx: index("driver_time_idx").on(t.driverId, t.recordedAt),
  // Fast live-tracking queries for the admin dashboard (latest ping per city)
  cityTimeIdx: index("city_time_idx").on(t.cityId, t.recordedAt),
}));

export type DriverLocationPing = typeof driverLocationPings.$inferSelect;
export type NewDriverLocationPing = typeof driverLocationPings.$inferInsert;

export const trackingAlertAcks = pgTable("tracking_alert_acks", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => users.id),
  alertDate: date("alert_date").notNull(),
  acknowledgedBy: uuid("acknowledged_by").notNull().references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqDriverDate: unique().on(t.driverId, t.alertDate),
}));

export type TrackingAlertAck = typeof trackingAlertAcks.$inferSelect;
