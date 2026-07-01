// CHANGED - support the duplicate review fields and self-referencing original lead.
import { pgTable, uuid, text, integer, numeric, timestamp, pgEnum, boolean, AnyPgColumn } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { users } from "./users";
import { streets } from "./streets";
import { districts } from "./districts";
import { zones } from "./zones";

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "reviewed",
  "approved",
  "rejected",
  // NEW - keep duplicate as a final status separate from rejected.
  "duplicate",
  "sent_to_client",
]);

export const constructionPhaseEnum = pgEnum("construction_phase", [
  "just_digging_started",
  "foundation_phase",
  "first_floor_starting",
  "other",
]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  // NEW - make client queue retries idempotent after response loss or refresh.
  clientSubmissionId: text("client_submission_id").unique(),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  driverId: uuid("driver_id").references(() => users.id),
  streetId: uuid("street_id").references(() => streets.id),
  districtId: uuid("district_id").references(() => districts.id),
  zoneId: uuid("zone_id").references(() => zones.id),
  siteName: text("site_name"),
  plotNumber: text("plot_number"),
  phase: constructionPhaseEnum("phase").notNull(),
  locationLat: numeric("location_lat", { precision: 10, scale: 7 }).notNull(),
  locationLng: numeric("location_lng", { precision: 10, scale: 7 }).notNull(),
  gpsAccuracyMeters: numeric("gps_accuracy_meters", { precision: 6, scale: 2 }),
  nearestLandmark: text("nearest_landmark"),
  ownerName: text("owner_name"),
  contractorName: text("contractor_name"),
  phoneNumber: text("phone_number"),
  projectName: text("project_name"),
  engineerName: text("engineer_name"),
  notes: text("notes"),
  status: leadStatusEnum("status").default("new"),
  qualityScore: integer("quality_score").default(0),
  duplicateRisk: text("duplicate_risk").default("low"),
  // NEW - record driver overrides that require an explicit admin duplicate decision.
  needsDuplicateReview: boolean("needs_duplicate_review").notNull().default(false),
  // NEW - retain the approved lead selected as the original when this lead is a duplicate.
  duplicateOfLeadId: uuid("duplicate_of_lead_id").references((): AnyPgColumn => leads.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
