import { pgTable, uuid, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { cities } from "./cities";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "city_manager",
  "driver",
  "client",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").references(() => cities.id),
  fullName: text("full_name").notNull(),
  email: text("email").unique(),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull(),
  iqamaNumber: text("iqama_number"),
  carPlateNumber: text("car_plate_number"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
