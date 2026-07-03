import { db } from "../db";
import { streets } from "../db/schema/streets";
import { surveyZones } from "../db/schema/surveyZones";
import { driverAssignments } from "../db/schema/assignments";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { haversineDistanceMeters } from "./qc.service";

// Any drizzle db client that supports select/update (plain `db` or a
// `db.transaction(async tx => ...)` callback's tx) — extracted so callers
// can pass either interchangeably.
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Road-km aggregation ───────────────────────────────────────────────────────

/** Recomputes districts.road_km as the sum of streets.length_km per district. */
export async function recomputeDistrictRoadKm(cityId: string): Promise<void> {
  await db.execute(sql`
    UPDATE districts d
    SET road_km = sub.total_km
    FROM (
      SELECT district_id, COALESCE(sum(length_km), 0) AS total_km
      FROM streets
      WHERE city_id = ${cityId}
      GROUP BY district_id
    ) sub
    WHERE d.id = sub.district_id AND d.city_id = ${cityId}
  `);
}

// ── Core formulas ───────────────────────────────────────────────────────────

/**
 * Realistic Driver Daily KM =
 *   (Petrol Budget / Petrol Price) × Vehicle KM per Liter × Survey Efficiency
 */
export function calcRealisticDriverDailyKm(city: {
  petrolPerDriverPerDay?: string | number | null;
  petrolPricePerLiter?: string | number | null;
  avgCarMileageKmPerLiter?: string | number | null;
  surveyEfficiencyPct?: number | null;
}): number {
  // Fall back to the spec's own defaults for any unconfigured city.
  const petrol = Number(city.petrolPerDriverPerDay ?? 50);
  const price = Number(city.petrolPricePerLiter ?? 2.18);
  const mileage = Number(city.avgCarMileageKmPerLiter ?? 14);
  const efficiency = (city.surveyEfficiencyPct ?? 60) / 100;
  if (!price || price <= 0) return 0;
  const liters = petrol / price;
  const rangeKm = liters * mileage;
  return rangeKm * efficiency;
}

export type DistrictRecommendation = {
  requiredDriverDays: number;
  requiredDrivers: number;
  message: string;
  needsSplit: boolean;
};

/** Per-district driver-days/recommendation, per the spec's completion logic. */
export function districtRecommendation(districtRoadKm: number, dailyKm: number): DistrictRecommendation {
  if (dailyKm <= 0 || districtRoadKm <= 0) {
    return { requiredDriverDays: 0, requiredDrivers: 0, message: "No road data", needsSplit: false };
  }
  const requiredDriverDays = districtRoadKm / dailyKm;
  const requiredDrivers = Math.ceil(districtRoadKm / dailyKm);

  let message: string;
  let needsSplit = false;
  if (requiredDriverDays <= 1) {
    message = "1 driver finishes in 1 day";
  } else if (requiredDriverDays <= 2) {
    message = `${requiredDrivers} drivers for 1 day OR 1 driver for ${Math.ceil(requiredDriverDays)} days`;
  } else {
    message = `Split into ${requiredDrivers} zones (district exceeds 2 driver-days)`;
    needsSplit = true;
  }
  return { requiredDriverDays, requiredDrivers, message, needsSplit };
}

// ── Auto zone-splitting ──────────────────────────────────────────────────────

export type SplittableStreet = { id: string; nameEn: string | null; lengthKm: string | number | null };
export type SplitZoneGroup = { label: string; streets: SplittableStreet[]; km: number };

/**
 * Greedily groups a district's streets into daily-capacity-sized zones.
 * Sorted by street name for a deterministic, debuggable result — this is a
 * deliberate simplification over geographic contiguity clustering, which
 * would need street-adjacency data OSM ways don't cleanly provide. Revisit
 * with k-means over street centroids if real geographic contiguity within a
 * zone becomes a requirement.
 */
export function splitDistrictIntoZones(districtStreets: SplittableStreet[], dailyKm: number): SplitZoneGroup[] {
  const sorted = [...districtStreets].sort((a, b) => (a.nameEn ?? "").localeCompare(b.nameEn ?? ""));
  const zones: SplitZoneGroup[] = [];
  let current: SplitZoneGroup = { label: "", streets: [], km: 0 };

  for (const street of sorted) {
    const streetKm = Number(street.lengthKm ?? 0);
    // Start a new zone if adding this street would meaningfully overshoot the
    // target AND the current zone already has at least one street.
    if (current.streets.length > 0 && dailyKm > 0 && current.km + streetKm > dailyKm * 1.1) {
      zones.push(current);
      current = { label: "", streets: [], km: 0 };
    }
    current.streets.push(street);
    current.km += streetKm;
  }
  if (current.streets.length) zones.push(current);

  return zones.map((z, i) => ({ ...z, label: `Zone ${String.fromCharCode(65 + i)}` }));
}

/**
 * Splits a district's remaining (not_assigned/on_hold, not-yet-zoned) streets
 * into survey_zones rows using splitDistrictIntoZones, writes them to the DB,
 * and links the streets via surveyZoneId. Idempotent: streets already linked
 * to a zone are excluded, so re-running only covers newly-unzoned streets.
 * If everything fits in one driver-day, still creates exactly one zone
 * ("Zone A") so every district has uniform zone-based assignment plumbing.
 * Shared by both the standalone split-district endpoint and auto-assign-zones.
 */
export async function splitDistrictStreetsIntoZoneRows(
  cityId: string,
  districtId: string,
  dailyKm: number,
): Promise<Array<{ id: string; label: string; targetKm: number; streetCount: number }>> {
  const eligibleStreets = await db
    .select({ id: streets.id, nameEn: streets.nameEn, lengthKm: streets.lengthKm })
    .from(streets)
    .where(and(
      eq(streets.districtId, districtId),
      inArray(streets.status, ["not_assigned", "on_hold"]),
      isNull(streets.surveyZoneId),
    ));

  const withLength = eligibleStreets.filter(s => s.lengthKm != null);
  if (!withLength.length) return [];

  const groups = splitDistrictIntoZones(withLength, dailyKm);
  if (!groups.length) return [];

  const insertedZones = await db.insert(surveyZones).values(groups.map(group => ({
    cityId,
    districtId,
    label: group.label,
    targetKm: group.km.toFixed(2),
    status: "not_assigned" as const,
  }))).returning({ id: surveyZones.id });

  await Promise.all(groups.map((group, i) =>
    db.update(streets)
      .set({ surveyZoneId: insertedZones[i].id })
      .where(inArray(streets.id, group.streets.map(s => s.id)))
  ));

  return groups.map((group, i) => ({
    id: insertedZones[i].id,
    label: group.label,
    targetKm: group.km,
    streetCount: group.streets.length,
  }));
}

// ── Single-writer sync for survey_zones assignment state ───────────────────────

/**
 * Keeps survey_zones.status/assignedDriverId/assignedDate consistent with the
 * underlying driverAssignments rows for that zone. MUST be called (in the
 * same transaction) after any insert/update/delete of driverAssignments rows
 * that have surveyZoneId set — this is the ONLY place that writes those three
 * columns, to avoid dual-source-of-truth drift.
 */
export async function syncSurveyZoneAssignmentState(zoneId: string, client: DbClient = db): Promise<void> {
  const [{ streetCount }] = await client
    .select({ streetCount: sql<number>`count(*)::int` })
    .from(streets)
    .where(eq(streets.surveyZoneId, zoneId));

  const assignmentRows = await client
    .select({ status: driverAssignments.status, driverId: driverAssignments.driverId, assignedDate: driverAssignments.assignedDate })
    .from(driverAssignments)
    .where(eq(driverAssignments.surveyZoneId, zoneId));

  const assignedCount = assignmentRows.length;

  let status: typeof surveyZones.$inferSelect["status"];
  if (assignedCount === 0) {
    status = "not_assigned";
  } else if (assignedCount < streetCount) {
    status = "partially_assigned";
  } else if (assignmentRows.every(r => r.status === "completed")) {
    // Rare path — normal completion goes through the zone-completion endpoint,
    // which sets status directly (completed/partially_completed/rejected).
    status = "completed";
  } else if (assignmentRows.some(r => r.status === "in_progress")) {
    status = "in_progress";
  } else {
    status = "assigned";
  }

  // Zones are assigned to exactly one driver at a time by construction
  // (auto-assign-zones never splits one zone across multiple drivers).
  const driverId = assignmentRows[0]?.driverId ?? null;
  const assignedDate = assignmentRows[0]?.assignedDate ?? null;

  await client.update(surveyZones)
    .set({ status, assignedDriverId: driverId, assignedDate })
    .where(eq(surveyZones.id, zoneId));
}

// ── GPS distance verification (used by driver zone-completion, Phase 4) ────────

/** Haversine-sums consecutive same-day GPS pings for a driver into a total km. */
export async function sumGpsDistanceForZone(driverId: string, date: string): Promise<number> {
  const pings = await db.execute(sql`
    SELECT location_lat, location_lng, recorded_at
    FROM driver_location_pings
    WHERE driver_id = ${driverId} AND recorded_at::date = ${date}::date
    ORDER BY recorded_at ASC
  `);

  let totalMeters = 0;
  for (let i = 1; i < pings.length; i++) {
    const prev = pings[i - 1];
    const curr = pings[i];
    totalMeters += haversineDistanceMeters(
      Number(prev.location_lat), Number(prev.location_lng),
      Number(curr.location_lat), Number(curr.location_lng),
    );
  }
  return totalMeters / 1000;
}

export type ZoneCompletionClassification = { status: "completed" | "partially_completed" | "rejected_needs_review"; notes: string | null };

const COMPLETION_MIN_RATIO = 0.8;
const PARTIAL_MIN_RATIO = 0.3;
const OVERSHOOT_MAX_RATIO = 3.0;

/** Classifies a completed survey zone by comparing actual GPS km to target km. */
export function classifyZoneCompletion(actualKm: number, targetKm: number, hasProof: boolean): ZoneCompletionClassification {
  const ratio = targetKm > 0 ? actualKm / targetKm : 0;
  const pct = Math.round(ratio * 100);

  if (ratio < PARTIAL_MIN_RATIO || ratio > OVERSHOOT_MAX_RATIO) {
    return {
      status: "rejected_needs_review",
      notes: `Actual ${actualKm.toFixed(1)}km vs target ${targetKm.toFixed(1)}km (${pct}%) — outside plausible range, needs manual review`,
    };
  }
  if (ratio >= COMPLETION_MIN_RATIO && hasProof) {
    return { status: "completed", notes: null };
  }
  if (ratio >= COMPLETION_MIN_RATIO && !hasProof) {
    return { status: "partially_completed", notes: "Distance target met but no photo/video proof uploaded — pending review" };
  }
  return { status: "partially_completed", notes: `Actual ${actualKm.toFixed(1)}km vs target ${targetKm.toFixed(1)}km (${pct}%)` };
}
