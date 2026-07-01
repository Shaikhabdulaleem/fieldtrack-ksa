import { pgTable, bigserial, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { users } from "./users";

export const activityLogs = pgTable("activity_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  cityId: uuid("city_id").references(() => cities.id),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
