import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { driverAssignments, streets, users, districts } from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../middleware/error";

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
