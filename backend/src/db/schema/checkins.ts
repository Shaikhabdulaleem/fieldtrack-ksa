import { pgTable, uuid, text, numeric, integer, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { users } from "./users";

export const driverCheckins = pgTable("driver_checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => users.id),
  cityId: uuid("city_id").references(() => cities.id),
  checkinDate: date("checkin_date").defaultNow(),

  // Check-in data
  checkinLat: numeric("checkin_lat", { precision: 10, scale: 7 }),
  checkinLng: numeric("checkin_lng", { precision: 10, scale: 7 }),
  checkinAccuracy: integer("checkin_accuracy"),
  selfieUrl: text("selfie_url"),
  odometerStart: integer("odometer_start"),
  odometerStartPhoto: text("odometer_start_photo"),
  fuelStart: text("fuel_start"),
  fuelStartPhoto: text("fuel_start_photo"),
  checkinAt: timestamp("checkin_at", { withTimezone: true }).defaultNow(),

  // Check-out data
  odometerEnd: integer("odometer_end"),
  odometerEndPhoto: text("odometer_end_photo"),
  fuelEnd: text("fuel_end"),
  fuelEndPhoto: text("fuel_end_photo"),
  checkoutLat: numeric("checkout_lat", { precision: 10, scale: 7 }),
  checkoutLng: numeric("checkout_lng", { precision: 10, scale: 7 }),
  checkoutAt: timestamp("checkout_at", { withTimezone: true }),

  // Computed
  kmDriven: integer("km_driven"),
}, (t) => [
  uniqueIndex("checkins_driver_date_uidx").on(t.driverId, t.checkinDate),
]);

export type DriverCheckin = typeof driverCheckins.$inferSelect;
export type NewDriverCheckin = typeof driverCheckins.$inferInsert;
