import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { driverAssignments, streets, users, districts, cities, surveyZones } from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../middleware/error";
import {
  calcRealisticDriverDailyKm,
  districtRecommendation,
  splitDistrictStreetsIntoZoneRows,
  syncSurveyZoneAssignmentState,
} from "../services/surveyZone.service";

export const assignmentsRouter = Router();

// POST /api/v1/assignments
assignmentsRouter.post("/assignments", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const schema = z.object({
      cityId: z.string().uuid(),
      driverId: z.string().uuid(),
      zoneId: z.string().uuid().optional(),
      districtId: z.string().uuid().optional(),
      streetIds: z.array(z.string().uuid()).min(1),
      assignedDate: z.string().optional(),
    });
    const { streetIds, ...base } = schema.parse(req.body);

    const rows = await db
      .insert(driverAssignments)
      .values(streetIds.map(streetId => ({ ...base, streetId, assignedBy: req.user!.sub })))
      .returning();

    // Mark streets as assigned
    await Promise.all(
      streetIds.map(id =>
        db.update(streets).set({ status: "assigned" }).where(eq(streets.id, id)),
      ),
    );

    res.status(201).json({ created: rows.length, assignments: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/assignments
assignmentsRouter.get("/assignments", requireAuth, async (req, res, next) => {
  try {
    const { city_id, driver_id, date } = req.query as Record<string, string>;

    const conditions = [];
    if (city_id) conditions.push(eq(driverAssignments.cityId, city_id));
    if (driver_id) conditions.push(eq(driverAssignments.driverId, driver_id));
    if (date) conditions.push(eq(driverAssignments.assignedDate, date));

    const rows = await db
      .select()
      .from(driverAssignments)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sql`assigned_date desc`);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/assignments/:id
assignmentsRouter.patch("/assignments/:id", requireAuth, requireRole("city_manager", "super_admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(["assigned", "in_progress", "completed", "skipped"]).optional(),
      skippedReason: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const updates: Record<string, unknown> = { ...data };
    if (data.status === "in_progress") updates.startedAt = new Date();
    if (data.status === "completed" || data.status === "skipped") updates.completedAt = new Date();

    const [row] = await db
      .update(driverAssignments)
      .set(updates)
      .where(eq(driverAssignments.id, req.params.id))
      .returning();

    if (!row) throw new AppError(404, "Assignment not found");
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/assignments/:id
assignmentsRouter.delete("/assignments/:id", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const [row] = await db
      .delete(driverAssignments)
      .where(eq(driverAssignments.id, req.params.id))
      .returning();
    if (!row) throw new AppError(404, "Assignment not found");

    if (row.streetId) {
      await db.update(streets).set({ status: "not_assigned" }).where(eq(streets.id, row.streetId));
    }

    res.json({ ok: true, deleted: row.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/bulk-delete
assignmentsRouter.post("/assignments/bulk-delete", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { assignmentIds } = z.object({
      assignmentIds: z.array(z.string().uuid()).min(1).max(5000),
    }).parse(req.body);

    // City managers can only delete assignments in their own city.
    if (req.user!.role === "city_manager") {
      const owned = await db
        .select({ id: driverAssignments.id })
        .from(driverAssignments)
        .where(and(inArray(driverAssignments.id, assignmentIds), eq(driverAssignments.cityId, req.user!.cityId!)));
      if (owned.length !== assignmentIds.length) {
        throw new AppError(403, "Cannot delete assignments outside your city");
      }
    }

    let deletedCount = 0;
    await db.transaction(async (tx) => {
      const rows = await tx
        .delete(driverAssignments)
        .where(inArray(driverAssignments.id, assignmentIds))
        .returning({ streetId: driverAssignments.streetId, surveyZoneId: driverAssignments.surveyZoneId });

      deletedCount = rows.length;

      const streetIds = rows.map(r => r.streetId).filter(Boolean) as string[];
      if (streetIds.length) {
        const stillAssigned = await tx
          .select({ streetId: driverAssignments.streetId })
          .from(driverAssignments)
          .where(and(
            inArray(driverAssignments.streetId, streetIds),
            inArray(driverAssignments.status, ["assigned", "in_progress"]),
          ));
        const stillAssignedSet = new Set(stillAssigned.map(r => r.streetId));
        const orphanedStreetIds = streetIds.filter(id => !stillAssignedSet.has(id));
        if (orphanedStreetIds.length) {
          await tx.update(streets).set({ status: "not_assigned" }).where(inArray(streets.id, orphanedStreetIds));
        }
      }

      const affectedZoneIds = [...new Set(rows.map(r => r.surveyZoneId).filter(Boolean) as string[])];
      for (const zoneId of affectedZoneIds) {
        await syncSurveyZoneAssignmentState(zoneId, tx);
      }
    });

    res.json({ ok: true, deleted: deletedCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/assign-district
assignmentsRouter.post("/assignments/assign-district", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const schema = z.object({
      cityId: z.string().uuid(),
      districtId: z.string().uuid(),
      driverId: z.string().uuid(),
      date: z.string().optional(),
    });
    const { cityId, districtId, driverId, date } = schema.parse(req.body);

    const unassignedStreets = await db
      .select({ id: streets.id })
      .from(streets)
      .where(and(eq(streets.districtId, districtId), eq(streets.status, "not_assigned")));

    if (!unassignedStreets.length) {
      return res.json({ created: 0, message: "No unassigned streets in this district" });
    }

    const assignedDate = date ?? new Date().toISOString().slice(0, 10);
    const rows = await db
      .insert(driverAssignments)
      .values(unassignedStreets.map(s => ({
        cityId,
        districtId,
        driverId,
        streetId: s.id,
        assignedBy: req.user!.sub,
        assignedDate,
      })))
      .returning();

    await db
      .update(streets)
      .set({ status: "assigned" })
      .where(inArray(streets.id, unassignedStreets.map(s => s.id)));

    res.status(201).json({ created: rows.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/reassign-district
assignmentsRouter.post("/assignments/reassign-district", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const schema = z.object({
      districtId: z.string().uuid(),
      newDriverId: z.string().uuid(),
    });
    const { districtId, newDriverId } = schema.parse(req.body);

    const existing = await db
      .select({ id: driverAssignments.id })
      .from(driverAssignments)
      .where(and(
        eq(driverAssignments.districtId, districtId),
        eq(driverAssignments.status, "assigned"),
      ));

    if (!existing.length) {
      return res.json({ updated: 0, message: "No active assignments in this district" });
    }

    await db
      .update(driverAssignments)
      .set({ driverId: newDriverId, assignedBy: req.user!.sub })
      .where(and(
        eq(driverAssignments.districtId, districtId),
        eq(driverAssignments.status, "assigned"),
      ));

    res.json({ updated: existing.length });
  } catch (err) {
    next(err);
  }
});

// NEW - bulk transfer only explicitly selected on-hold streets to an active same-city Driver.
assignmentsRouter.post("/assignments/reassign-on-hold", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { streetIds, newDriverId } = z.object({
      streetIds: z.array(z.string().uuid()).min(1).transform(ids => [...new Set(ids)]),
      newDriverId: z.string().uuid(),
    }).parse(req.body);

    const [replacement] = await db
      .select({ id: users.id, cityId: users.cityId })
      .from(users)
      .where(and(eq(users.id, newDriverId), eq(users.role, "driver"), eq(users.isActive, true)))
      .limit(1);
    if (!replacement?.cityId) throw new AppError(400, "Replacement Driver must be active and assigned to a city");

    const selectedStreets = await db
      .select({ id: streets.id, cityId: streets.cityId, status: streets.status })
      .from(streets)
      .where(inArray(streets.id, streetIds));
    if (
      selectedStreets.length !== streetIds.length
      || selectedStreets.some(street => street.status !== "on_hold" || street.cityId !== replacement.cityId)
    ) {
      throw new AppError(400, "All selected streets must be on hold and in the replacement Driver's city");
    }

    const heldAssignments = await db
      .select({ id: driverAssignments.id, streetId: driverAssignments.streetId })
      .from(driverAssignments)
      .where(and(
        inArray(driverAssignments.streetId, streetIds),
        eq(driverAssignments.status, "on_hold"),
      ));
    const heldStreetCount = new Set(heldAssignments.map(row => row.streetId).filter(Boolean)).size;
    if (heldStreetCount !== streetIds.length) {
      throw new AppError(400, "Every selected street must have an on-hold assignment");
    }

    // NEW - update assignment ownership and street color together so Grey always returns to Blue.
    await db.transaction(async tx => {
      await tx
        .update(driverAssignments)
        .set({
          driverId: newDriverId,
          status: "assigned",
          assignedBy: req.user!.sub,
          assignedDate: new Date().toISOString().slice(0, 10),
          startedAt: null,
          completedAt: null,
          skippedReason: null,
        })
        .where(inArray(driverAssignments.id, heldAssignments.map(row => row.id)));
      await tx.update(streets).set({ status: "assigned" }).where(inArray(streets.id, streetIds));
    });

    res.json({ updated: streetIds.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/calculate-plan
assignmentsRouter.post("/assignments/calculate-plan", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { cityId, targetDays, targetLeadsPerDriver, maxStreetsPerDriver } = z.object({
      cityId: z.string().uuid(),
      targetDays: z.number().int().min(1),
      targetLeadsPerDriver: z.number().int().min(0).default(3),
      maxStreetsPerDriver: z.number().int().min(1).default(20),
    }).parse(req.body);

    const activeDrivers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.cityId, cityId), eq(users.role, "driver"), eq(users.isActive, true)));

    const [streetCounts] = await db.execute(sql`
      SELECT
        count(*) as total,
        count(*) filter (where status = 'not_assigned') as unassigned,
        count(*) filter (where status = 'completed') as completed
      FROM streets WHERE city_id = ${cityId}
    `);

    const totalStreets = Number(streetCounts.total ?? 0);
    const totalUnassigned = Number(streetCounts.unassigned ?? 0);
    const totalCompleted = Number(streetCounts.completed ?? 0);
    const driverCount = activeDrivers.length;
    const dailyCapacity = driverCount * maxStreetsPerDriver;
    const daysNeeded = dailyCapacity > 0 ? Math.ceil(totalUnassigned / dailyCapacity) : 0;
    const feasible = daysNeeded <= targetDays;
    const driversNeeded = maxStreetsPerDriver > 0 ? Math.ceil(totalUnassigned / (targetDays * maxStreetsPerDriver)) : 0;
    const shortfall = Math.max(0, driversNeeded - driverCount);
    const expectedTotalLeads = driverCount * targetLeadsPerDriver * targetDays;
    const streetsPerDriverPerDay = driverCount > 0 ? Math.min(maxStreetsPerDriver, Math.ceil(totalUnassigned / (driverCount * targetDays))) : 0;

    res.json({
      totalStreets,
      totalUnassigned,
      totalCompleted,
      activeDrivers: driverCount,
      maxStreetsPerDriverPerDay: maxStreetsPerDriver,
      targetLeadsPerDriver,
      dailyCapacity,
      daysNeeded,
      targetDays,
      feasible,
      driversNeeded,
      shortfall,
      expectedTotalLeads,
      streetsPerDriverPerDay,
      coveragePct: totalStreets > 0 ? Math.round((totalCompleted / totalStreets) * 100) : 0,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/auto-plan (geographic clustering — nearby districts assigned to same driver)
assignmentsRouter.post("/assignments/auto-plan", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { cityId, date, maxStreetsPerDriver } = z.object({
      cityId: z.string().uuid(),
      date: z.string().optional(),
      maxStreetsPerDriver: z.number().int().min(1).optional(),
    }).parse(req.body);

    const driverList = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.cityId, cityId), eq(users.role, "driver"), eq(users.isActive, true)));

    if (!driverList.length) throw new AppError(400, "No active drivers in this city");

    // Get districts with unassigned streets + their center coordinates
    const districtData = await db.execute(sql`
      SELECT
        d.id as district_id,
        d.center_lat,
        d.center_lng,
        count(s.id) as street_count
      FROM districts d
      JOIN streets s ON s.district_id = d.id AND s.status = 'not_assigned'
      WHERE d.city_id = ${cityId}
      GROUP BY d.id, d.center_lat, d.center_lng
      HAVING count(s.id) > 0
      ORDER BY d.center_lat, d.center_lng
    `);

    if (!districtData.length) return res.json({ message: "All streets already assigned", created: 0 });

    // Sort districts geographically using a simple spatial sort
    // Group nearby districts by dividing the city into grid cells
    const distWithCoords = districtData.map(d => ({
      districtId: String(d.district_id),
      lat: Number(d.center_lat ?? 0),
      lng: Number(d.center_lng ?? 0),
      streetCount: Number(d.street_count),
    }));

    // Sort by lat then lng to create geographic clusters
    distWithCoords.sort((a, b) => {
      const gridA = Math.floor(a.lat * 50) * 1000 + Math.floor(a.lng * 50);
      const gridB = Math.floor(b.lat * 50) * 1000 + Math.floor(b.lng * 50);
      return gridA - gridB;
    });

    const cap = maxStreetsPerDriver ?? 20;
    const numDrivers = driverList.length;
    const assignDate = date ?? new Date().toISOString().slice(0, 10);

    // Split sorted districts into driver-sized chunks (geographic clusters)
    const driverChunks: typeof distWithCoords[] = Array.from({ length: numDrivers }, () => []);
    const driverLoads = new Array(numDrivers).fill(0);

    for (const dist of distWithCoords) {
      // Find driver with least load that can still fit this district
      let bestDriver = -1;
      let bestLoad = Infinity;
      for (let i = 0; i < numDrivers; i++) {
        if (driverLoads[i] < cap && driverLoads[i] < bestLoad) {
          bestDriver = i;
          bestLoad = driverLoads[i];
        }
      }
      if (bestDriver === -1) break; // all drivers full

      const streetsToAssign = Math.min(dist.streetCount, cap - driverLoads[bestDriver]);
      driverChunks[bestDriver].push({ ...dist, streetCount: streetsToAssign });
      driverLoads[bestDriver] += streetsToAssign;
    }

    // Now fetch actual street IDs and create assignments
    const rows: typeof driverAssignments.$inferInsert[] = [];

    for (let dIdx = 0; dIdx < numDrivers; dIdx++) {
      const driver = driverList[dIdx];
      let remaining = cap;

      for (const chunk of driverChunks[dIdx]) {
        if (remaining <= 0) break;

        const distStreets = await db
          .select({ id: streets.id, districtId: streets.districtId })
          .from(streets)
          .where(and(eq(streets.districtId, chunk.districtId), eq(streets.status, "not_assigned")))
          .limit(remaining);

        distStreets.forEach(s => {
          rows.push({
            cityId,
            driverId: driver.id,
            streetId: s.id,
            districtId: s.districtId ?? undefined,
            assignedBy: req.user!.sub,
            assignedDate: assignDate,
          });
        });
        remaining -= distStreets.length;
      }
    }

    if (rows.length > 0) {
      await db.insert(driverAssignments).values(rows);
      const streetIds = rows.map(r => r.streetId!).filter(Boolean);
      if (streetIds.length > 0) {
        await db.update(streets).set({ status: "assigned" }).where(inArray(streets.id, streetIds));
      }
    }

    // Count how many unique districts were assigned
    const uniqueDistricts = new Set(rows.map(r => r.districtId)).size;

    res.status(201).json({
      created: rows.length,
      driversAssigned: driverList.length,
      streetsPerDriver: cap,
      remainingUnassigned: distWithCoords.reduce((s, d) => s + d.streetCount, 0) - rows.length,
      assignedDistricts: uniqueDistricts,
    });
  } catch (err) {
    next(err);
  }
});

// ── District-Based Driver Survey Coverage Planner (road-km-based) ──────────────
// New endpoints below are additive — calculate-plan and auto-plan above are
// left completely untouched so other cities keep working on the legacy
// street-count-based flow.

// POST /api/v1/assignments/assign-survey-zone — manual per-zone override,
// alongside auto-assign-zones. Mirrors assign-district's pattern.
assignmentsRouter.post("/assignments/assign-survey-zone", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { zoneId, driverId, date } = z.object({
      zoneId: z.string().uuid(),
      driverId: z.string().uuid(),
      date: z.string().optional(),
    }).parse(req.body);

    const [zone] = await db.select().from(surveyZones).where(eq(surveyZones.id, zoneId)).limit(1);
    if (!zone) throw new AppError(404, "Survey zone not found");

    const zoneStreets = await db
      .select({ id: streets.id })
      .from(streets)
      .where(eq(streets.surveyZoneId, zoneId));
    if (!zoneStreets.length) {
      return res.json({ created: 0, message: "This zone has no streets" });
    }

    const assignedDate = date ?? new Date().toISOString().slice(0, 10);
    await db.transaction(async (tx) => {
      // Replace any existing (e.g. previously auto-assigned) assignments for
      // this zone before creating fresh ones for the new driver.
      await tx.delete(driverAssignments).where(eq(driverAssignments.surveyZoneId, zoneId));
      await tx.insert(driverAssignments).values(zoneStreets.map(s => ({
        cityId: zone.cityId,
        driverId,
        districtId: zone.districtId,
        streetId: s.id,
        surveyZoneId: zoneId,
        assignedBy: req.user!.sub,
        assignedDate,
      })));
      await tx.update(streets).set({ status: "assigned" }).where(inArray(streets.id, zoneStreets.map(s => s.id)));
      await syncSurveyZoneAssignmentState(zoneId, tx);
    });

    res.status(201).json({ created: zoneStreets.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/calculate-plan-km
assignmentsRouter.post("/assignments/calculate-plan-km", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const body = z.object({
      cityId: z.string().uuid(),
      targetDays: z.number().int().min(1),
      numberOfDrivers: z.number().int().min(1),
      petrolPerDriverPerDay: z.number().min(0),
      petrolPricePerLiter: z.number().gt(0),
      avgCarMileageKmPerLiter: z.number().min(0),
      surveyEfficiencyPct: z.number().int().min(0).max(100),
      targetLeadsPerDriver: z.number().int().min(0),
    }).parse(req.body);

    const dailyKm = calcRealisticDriverDailyKm(body);

    const [cityRoadStats] = await db.execute(sql`
      SELECT
        coalesce(sum(length_km), 0) as total_road_km,
        coalesce(sum(length_km) filter (where status in ('not_assigned','on_hold')), 0) as remaining_road_km,
        coalesce(sum(length_km) filter (where status = 'completed'), 0) as completed_road_km,
        count(*) as total_streets
      FROM streets WHERE city_id = ${body.cityId}
    `);

    const [{ totalDistricts }] = await db
      .select({ totalDistricts: sql<number>`count(*)::int` })
      .from(districts)
      .where(eq(districts.cityId, body.cityId));

    const totalRoadKm = Number(cityRoadStats.total_road_km);
    const remainingRoadKm = Number(cityRoadStats.remaining_road_km);
    const completedRoadKm = Number(cityRoadStats.completed_road_km);
    const totalStreets = Number(cityRoadStats.total_streets);

    const totalDailyTeamCapacity = body.numberOfDrivers * dailyKm;
    const estimatedCompletionDays = totalDailyTeamCapacity > 0 ? Math.ceil(remainingRoadKm / totalDailyTeamCapacity) : 0;
    const feasible = estimatedCompletionDays <= body.targetDays;
    const driversNeeded = (body.targetDays > 0 && dailyKm > 0) ? Math.ceil(remainingRoadKm / (body.targetDays * dailyKm)) : 0;
    const shortfall = Math.max(0, driversNeeded - body.numberOfDrivers);
    const expectedTotalLeads = body.numberOfDrivers * body.targetLeadsPerDriver * body.targetDays;
    const coveragePct = totalRoadKm > 0 ? Math.round((completedRoadKm / totalRoadKm) * 100) : 0;

    const districtRows = await db.execute(sql`
      SELECT d.id as district_id, d.name_en,
        coalesce(sum(s.length_km), 0) as road_km,
        coalesce(sum(s.length_km) filter (where s.status in ('not_assigned','on_hold')), 0) as remaining_km
      FROM districts d
      LEFT JOIN streets s ON s.district_id = d.id
      WHERE d.city_id = ${body.cityId}
      GROUP BY d.id, d.name_en
      HAVING coalesce(sum(s.length_km), 0) > 0
      ORDER BY road_km DESC
    `);

    const districtsOut = districtRows.map(r => {
      const remainingKm = Number(r.remaining_km);
      const rec = districtRecommendation(remainingKm, dailyKm);
      return {
        districtId: String(r.district_id),
        nameEn: String(r.name_en),
        roadKm: Number(r.road_km),
        remainingKm,
        requiredDriverDays: rec.requiredDriverDays,
        requiredDrivers: rec.requiredDrivers,
        recommendation: rec.message,
        needsSplit: rec.needsSplit,
      };
    });

    res.json({
      realisticDriverDailyKm: dailyKm,
      totalRoadKm,
      remainingRoadKm,
      totalDrivers: body.numberOfDrivers,
      totalDistricts,
      totalStreets,
      driverDailyKmCapacity: dailyKm,
      totalDailyTeamCapacity,
      estimatedCompletionDays,
      feasible,
      driversNeeded,
      shortfall,
      expectedTotalLeads,
      coveragePct,
      districts: districtsOut,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/split-district — divides a district's remaining
// streets into daily-capacity-sized survey_zones. Idempotent.
assignmentsRouter.post("/assignments/split-district", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { cityId, districtId } = z.object({
      cityId: z.string().uuid(),
      districtId: z.string().uuid(),
    }).parse(req.body);

    const [city] = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!city) throw new AppError(404, "City not found");

    const dailyKm = calcRealisticDriverDailyKm(city);
    const created = await splitDistrictStreetsIntoZoneRows(cityId, districtId, dailyKm);

    res.status(201).json({ created: created.length, zones: created });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/auto-assign-zones — km-aware evolution of
// auto-plan above: bin-packs survey_zones onto drivers without exceeding
// each driver's realistic daily km capacity. Still creates one
// driverAssignments row per street (with surveyZoneId set) so the existing
// driver "today"/GPS/street-visit flow keeps working unchanged.
assignmentsRouter.post("/assignments/auto-assign-zones", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { cityId, date } = z.object({
      cityId: z.string().uuid(),
      date: z.string().optional(),
    }).parse(req.body);

    const [city] = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!city) throw new AppError(404, "City not found");
    const dailyKm = calcRealisticDriverDailyKm(city);

    const activeDrivers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.cityId, cityId), eq(users.role, "driver"), eq(users.isActive, true)));
    if (!activeDrivers.length) throw new AppError(400, "No active drivers in this city");

    // Auto-split any district that still has remaining, unzoned, length-tagged streets.
    const districtsWithUnzonedStreets = await db.execute(sql`
      SELECT DISTINCT district_id FROM streets
      WHERE city_id = ${cityId} AND status IN ('not_assigned','on_hold')
        AND survey_zone_id IS NULL AND length_km IS NOT NULL AND district_id IS NOT NULL
    `);
    await Promise.all(
      districtsWithUnzonedStreets
        .filter(row => row.district_id)
        .map(row => splitDistrictStreetsIntoZoneRows(cityId, String(row.district_id), dailyKm))
    );

    // Largest-first bin-packing onto drivers' remaining daily km capacity.
    const pendingZones = await db
      .select({ id: surveyZones.id, districtId: surveyZones.districtId, targetKm: surveyZones.targetKm })
      .from(surveyZones)
      .where(and(eq(surveyZones.cityId, cityId), eq(surveyZones.status, "not_assigned")))
      .orderBy(sql`target_km desc`);

    const assignDate = date ?? new Date().toISOString().slice(0, 10);
    const driverRemainingKm = new Map(activeDrivers.map(d => [d.id, dailyKm]));
    let zonesAssigned = 0;
    const driversUsed = new Set<string>();

    // Batch-fetch every pending zone's streets in one query instead of one
    // query per zone, then group them in memory.
    const allZoneStreets = pendingZones.length
      ? await db
          .select({ id: streets.id, surveyZoneId: streets.surveyZoneId })
          .from(streets)
          .where(inArray(streets.surveyZoneId, pendingZones.map(z => z.id)))
      : [];
    const streetsByZone = new Map<string, string[]>();
    for (const s of allZoneStreets) {
      if (!s.surveyZoneId) continue;
      const list = streetsByZone.get(s.surveyZoneId) ?? [];
      list.push(s.id);
      streetsByZone.set(s.surveyZoneId, list);
    }

    // Largest-first bin-packing is pure in-memory bookkeeping — resolve every
    // zone's driver assignment first, then run the DB writes concurrently.
    const zoneAssignments: Array<{ zoneId: string; districtId: string | null; driverId: string; streetIds: string[] }> = [];
    for (const zone of pendingZones) {
      const zoneKm = Number(zone.targetKm);

      let bestDriverId: string | null = null;
      let bestRemaining = -1;
      for (const [driverId, remaining] of driverRemainingKm) {
        if (remaining >= zoneKm && remaining > bestRemaining) {
          bestDriverId = driverId;
          bestRemaining = remaining;
        }
      }
      if (!bestDriverId) continue; // no driver has room left this round — leave not_assigned

      zoneAssignments.push({
        zoneId: zone.id,
        districtId: zone.districtId,
        driverId: bestDriverId,
        streetIds: streetsByZone.get(zone.id) ?? [],
      });
      driverRemainingKm.set(bestDriverId, bestRemaining - zoneKm);
      driversUsed.add(bestDriverId);
      zonesAssigned++;
    }

    await Promise.all(zoneAssignments.map(({ zoneId, districtId, driverId, streetIds }) =>
      db.transaction(async (tx) => {
        if (streetIds.length) {
          await tx.insert(driverAssignments).values(streetIds.map(streetId => ({
            cityId,
            driverId,
            districtId,
            streetId,
            surveyZoneId: zoneId,
            assignedBy: req.user!.sub,
            assignedDate: assignDate,
          })));
          await tx.update(streets).set({ status: "assigned" }).where(inArray(streets.id, streetIds));
        }
        await syncSurveyZoneAssignmentState(zoneId, tx);
      })
    ));

    const [remainingRoadKmRow] = await db.execute(sql`
      SELECT coalesce(sum(length_km),0) as remaining_km FROM streets
      WHERE city_id = ${cityId} AND status IN ('not_assigned','on_hold')
    `);
    const remainingRoadKm = Number(remainingRoadKmRow.remaining_km);
    const estimatedProjectDays = (activeDrivers.length > 0 && dailyKm > 0)
      ? Math.ceil(remainingRoadKm / (activeDrivers.length * dailyKm))
      : 0;

    res.status(201).json({
      zonesAssigned,
      driversUsed: driversUsed.size,
      unassignedZones: pendingZones.length - zonesAssigned,
      estimatedProjectDays,
    });
  } catch (err) {
    next(err);
  }
});
