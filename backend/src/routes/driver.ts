import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { driverAssignments, streets, leads, leadPhotos, users, cities, districts, zones, driverCheckins } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload, uploadFile } from "../services/upload.service";
import { AppError } from "../middleware/error";

export const driverRouter = Router();

// GET /api/v1/driver/today
driverRouter.get("/driver/today", requireAuth, requireRole("driver"), async (req, res, next) => {
  try {
    const driverId = req.user!.sub;
    const today = new Date().toISOString().slice(0, 10);

    const assignments = await db
      .select({
        id: driverAssignments.id,
        streetId: driverAssignments.streetId,
        zoneId: driverAssignments.zoneId,
        districtId: driverAssignments.districtId,
        status: driverAssignments.status,
        streetNameEn: streets.nameEn,
        streetNameAr: streets.nameAr,
        streetStatus: streets.status,
        districtName: districts.nameEn,
        zoneName: zones.nameEn,
      })
      .from(driverAssignments)
      .leftJoin(streets, eq(driverAssignments.streetId, streets.id))
      .leftJoin(districts, eq(driverAssignments.districtId, districts.id))
      .leftJoin(zones, eq(districts.zoneId, zones.id))
      .where(and(eq(driverAssignments.driverId, driverId), eq(driverAssignments.assignedDate, today)));

    const [driver] = await db
      .select({ fullName: users.fullName, cityId: users.cityId, cityName: cities.nameEn })
      .from(users)
      .leftJoin(cities, eq(users.cityId, cities.id))
      .where(eq(users.id, driverId))
      .limit(1);

    const firstAssignment = assignments[0];

    res.json({
      driverId,
      driverName: driver?.fullName,
      cityId: driver?.cityId,
      cityName: driver?.cityName ?? "",
      districtName: firstAssignment?.districtName ?? "",
      zoneName: firstAssignment?.zoneName ?? "",
      date: today,
      targetStreets: assignments.length,
      streets: assignments,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/driver/check-in
driverRouter.post(
  "/driver/check-in",
  requireAuth,
  requireRole("driver"),
  upload.fields([
    { name: "selfie", maxCount: 1 },
    { name: "odometerPhoto", maxCount: 1 },
    { name: "fuelPhoto", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const schema = z.object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        accuracy: z.coerce.number().optional(),
        odometerReading: z.coerce.number().optional(),
        fuelLevel: z.enum(["full", "3/4", "1/2", "1/4", "low"]).optional(),
      });
      const { lat, lng, accuracy, odometerReading, fuelLevel } = schema.parse(req.body);

      const files = req.files as Record<string, Express.Multer.File[]>;

      // Enforce selfie is required
      if (!files?.selfie?.[0]) {
        throw new AppError(400, "Selfie photo is required for check-in");
      }

      // Prevent duplicate check-in on the same day
      const today = new Date().toISOString().slice(0, 10);
      const [existing] = await db
        .select({ id: driverCheckins.id })
        .from(driverCheckins)
        .where(and(eq(driverCheckins.driverId, req.user!.sub), eq(driverCheckins.checkinDate, today)))
        .limit(1);
      if (existing) {
        throw new AppError(409, "You have already checked in today");
      }

      // Upload photos to Supabase Storage concurrently
      const [selfieUrl, odometerPhotoUrl, fuelPhotoUrl] = await Promise.all([
        files?.selfie?.[0]        ? uploadFile(files.selfie[0])        : Promise.resolve(null),
        files?.odometerPhoto?.[0] ? uploadFile(files.odometerPhoto[0]) : Promise.resolve(null),
        files?.fuelPhoto?.[0]     ? uploadFile(files.fuelPhoto[0])     : Promise.resolve(null),
      ]);

      await db.update(users).set({ isActive: true }).where(eq(users.id, req.user!.sub));

      const [driver] = await db.select({ cityId: users.cityId }).from(users).where(eq(users.id, req.user!.sub)).limit(1);

      const [checkin] = await db.insert(driverCheckins).values({
        driverId: req.user!.sub,
        cityId: driver?.cityId ?? undefined,
        checkinLat: String(lat),
        checkinLng: String(lng),
        checkinAccuracy: accuracy ? Math.round(accuracy) : undefined,
        selfieUrl,
        odometerStart: odometerReading,
        odometerStartPhoto: odometerPhotoUrl,
        fuelStart: fuelLevel,
        fuelStartPhoto: fuelPhotoUrl,
      }).returning();

      res.json({
        checkedIn: true,
        checkinId: checkin.id,
        selfieUrl,
        odometerPhotoUrl,
        fuelPhotoUrl,
        gps: { lat, lng, accuracy },
        checkedInAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/driver/check-out
driverRouter.post(
  "/driver/check-out",
  requireAuth,
  requireRole("driver"),
  upload.fields([
    { name: "odometerPhoto", maxCount: 1 },
    { name: "fuelPhoto", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const schema = z.object({
        odometerReading: z.coerce.number().optional(),
        fuelLevel: z.enum(["full", "3/4", "1/2", "1/4", "low"]).optional(),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
      });
      const { odometerReading, fuelLevel, lat, lng } = schema.parse(req.body);

      const files = req.files as Record<string, Express.Multer.File[]>;

      const today = new Date().toISOString().slice(0, 10);

      // Require an existing check-in before allowing check-out
      const [checkin] = await db
        .select()
        .from(driverCheckins)
        .where(and(eq(driverCheckins.driverId, req.user!.sub), eq(driverCheckins.checkinDate, today)))
        .limit(1);

      if (!checkin) {
        throw new AppError(400, "No check-in found for today. Please check in first.");
      }

      const [odometerPhotoUrl, fuelPhotoUrl] = await Promise.all([
        files?.odometerPhoto?.[0] ? uploadFile(files.odometerPhoto[0]) : Promise.resolve(null),
        files?.fuelPhoto?.[0]     ? uploadFile(files.fuelPhoto[0])     : Promise.resolve(null),
      ]);

      if (checkin) {
        const kmDriven = odometerReading && checkin.odometerStart
          ? odometerReading - checkin.odometerStart
          : undefined;

        await db.update(driverCheckins).set({
          odometerEnd: odometerReading,
          odometerEndPhoto: odometerPhotoUrl,
          fuelEnd: fuelLevel,
          fuelEndPhoto: fuelPhotoUrl,
          checkoutLat: lat ? String(lat) : undefined,
          checkoutLng: lng ? String(lng) : undefined,
          checkoutAt: new Date(),
          kmDriven,
        }).where(eq(driverCheckins.id, checkin.id));
      }

      const [row] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(driverAssignments)
        .where(and(
          eq(driverAssignments.driverId, req.user!.sub),
          eq(driverAssignments.assignedDate, today),
          eq(driverAssignments.status, "completed"),
        ));

      res.json({
        checkedOut: true,
        streetsCompleted: row.count,
        kmDriven: odometerReading && checkin?.odometerStart ? odometerReading - checkin.odometerStart : null,
        checkedOutAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/streets/:id/visit
driverRouter.post("/streets/:id/visit", requireAuth, requireRole("driver"), async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(["in_progress", "completed", "skipped"]),
      skippedReason: z.string().optional(),
    });
    const data = schema.parse(req.body);

    // Verify this street is assigned to the driver today
    const today = new Date().toISOString().slice(0, 10);
    const [assignment] = await db
      .select({ id: driverAssignments.id })
      .from(driverAssignments)
      .where(and(
        eq(driverAssignments.streetId, req.params.id),
        eq(driverAssignments.driverId, req.user!.sub),
        eq(driverAssignments.assignedDate, today),
      ))
      .limit(1);
    if (!assignment) {
      throw new AppError(403, "This street is not assigned to you today");
    }

    await db
      .update(streets)
      .set({ status: data.status })
      .where(eq(streets.id, req.params.id));

    const updates: Record<string, unknown> = { status: data.status };
    if (data.status === "in_progress") updates.startedAt = new Date();
    if (data.status === "completed" || data.status === "skipped") {
      updates.completedAt = new Date();
      if (data.skippedReason) updates.skippedReason = data.skippedReason;
    }

    await db
      .update(driverAssignments)
      .set(updates)
      .where(and(
        eq(driverAssignments.streetId, req.params.id),
        eq(driverAssignments.driverId, req.user!.sub),
      ));

    res.json({ ok: true, streetId: req.params.id, status: data.status });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/sync/offline
driverRouter.post("/sync/offline", requireAuth, requireRole("driver"), async (req, res, next) => {
  try {
    const schema = z.object({
      leads: z.array(z.object({
        cityId: z.string().uuid(),
        phase: z.enum(["just_digging_started", "foundation_phase", "first_floor_starting", "other"]),
        locationLat: z.coerce.number(),
        locationLng: z.coerce.number(),
        siteName: z.string().optional(),
        notes: z.string().optional(),
      })).optional().default([]),
      streetVisits: z.array(z.object({
        streetId: z.string().uuid(),
        status: z.enum(["completed", "skipped"]),
      })).optional().default([]),
    });

    const { leads: draftLeads, streetVisits } = schema.parse(req.body);

    const insertedLeads = draftLeads.length
      ? await db.insert(leads).values(
          draftLeads.map(l => ({
            ...l,
            locationLat: String(l.locationLat),
            locationLng: String(l.locationLng),
            driverId: req.user!.sub,
          })),
        ).returning({ id: leads.id })
      : [];

    for (const visit of streetVisits) {
      await db.update(streets).set({ status: visit.status }).where(eq(streets.id, visit.streetId));
    }

    res.json({
      synced: true,
      leadsCreated: insertedLeads.length,
      streetsUpdated: streetVisits.length,
    });
  } catch (err) {
    next(err);
  }
});
