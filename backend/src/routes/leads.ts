import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { leads, leadPhotos, users } from "../db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload, uploadPhotoFields, deleteFilesByUrls } from "../services/upload.service";
import { logActivity } from "../services/activity.service";
import { AppError } from "../middleware/error";
// NEW - share exact duplicate detection between submission and approval.
import { findNearestApprovedLead, getLeadComparisonSummary } from "../services/qc.service";

export const leadsRouter = Router();

// NEW - let the driver inspect the nearest approved lead before uploading photos.
leadsRouter.post("/duplicate-precheck", requireAuth, requireRole("driver"), async (req, res, next) => {
  try {
    const data = z.object({
      locationLat: z.coerce.number().min(-90).max(90),
      locationLng: z.coerce.number().min(-180).max(180),
    }).parse(req.body);
    const nearbyLead = await findNearestApprovedLead(data.locationLat, data.locationLng);
    res.json({
      hasNearbyLead: Boolean(nearbyLead),
      nearbyLead,
      distanceMeters: nearbyLead?.distanceMeters ?? null,
    });
  } catch (err) {
    next(err);
  }
});

function computeQualityScore(params: {
  gpsAccuracy?: number;
  photoTypes: string[];
}): number {
  let score = 0;
  if (params.gpsAccuracy !== undefined && params.gpsAccuracy <= 10) score += 30;
  if (params.photoTypes.includes("billboard")) score += 20;
  if (params.photoTypes.includes("front")) score += 20;
  if (params.photoTypes.includes("contractor_board")) score += 15;
  const hasAll = ["billboard", "front", "side", "contractor_board"].every(t =>
    params.photoTypes.includes(t),
  );
  if (hasAll) score += 15;
  return Math.min(score, 100);
}

// POST /api/v1/leads
leadsRouter.post(
  "/",
  requireAuth,
  requireRole("driver"),
  upload.fields([
    { name: "billboard", maxCount: 5 },
    { name: "front", maxCount: 5 },
    { name: "side", maxCount: 5 },
    { name: "contractor_board", maxCount: 5 },
  ]),
  async (req, res, next) => {
    try {
      const schema = z.object({
        cityId: z.string().uuid(),
        phase: z.enum(["just_digging_started", "foundation_phase", "first_floor_starting", "other"]),
        locationLat: z.coerce.number().min(-90).max(90),
        locationLng: z.coerce.number().min(-180).max(180),
        gpsAccuracyMeters: z.coerce.number().optional(),
        streetId: z.string().uuid().optional(),
        districtId: z.string().uuid().optional(),
        zoneId: z.string().uuid().optional(),
        siteName: z.string().max(500).optional(),
        plotNumber: z.string().max(100).optional(),
        nearestLandmark: z.string().max(500).optional(),
        ownerName: z.string().max(200).optional(),
        contractorName: z.string().max(200).optional(),
        phoneNumber: z.string().max(30).optional(),
        projectName: z.string().max(500).optional(),
        engineerName: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        // NEW - identify one persistent client queue entry across every retry.
        clientSubmissionId: z.string().min(1).max(100).optional(),
        // NEW - capture the driver's explicit different-site decision.
        submitAsDifferentSite: z.preprocess(value => value === true || value === "true", z.boolean()),
      });

      const data = schema.parse(req.body);
      // NEW - return the original confirmed lead when a response-loss retry repeats its queue ID.
      if (data.clientSubmissionId) {
        const [existingLead] = await db
          .select()
          .from(leads)
          // CHANGED - idempotency can only return a lead owned by the authenticated Driver.
          .where(and(eq(leads.clientSubmissionId, data.clientSubmissionId), eq(leads.driverId, req.user!.sub)))
          .limit(1);
        if (existingLead) {
          const [photoCountRow] = await db
            .select({ count: count() })
            .from(leadPhotos)
            .where(eq(leadPhotos.leadId, existingLead.id));
          return res.status(200).json({
            ...existingLead,
            photoCount: photoCountRow.count,
            confirmed: true,
            message: "Lead received successfully",
          });
        }
      }
      // NEW - enforce duplicate confirmation on the server before any photo upload or insert.
      const nearbyLead = await findNearestApprovedLead(data.locationLat, data.locationLng);
      if (nearbyLead && !data.submitAsDifferentSite) {
        return res.status(409).json({
          error: "A nearby approved lead requires a duplicate decision",
          code: "DUPLICATE_CONFIRMATION_REQUIRED",
          hasNearbyLead: true,
          nearbyLead,
          distanceMeters: nearbyLead.distanceMeters,
        });
      }
      // NEW - prevent the request-only confirmation field from being written as a lead column.
      const { submitAsDifferentSite, ...leadData } = data;
      const files = req.files as Record<string, Express.Multer.File[]>;
      const photoTypes = Object.keys(files ?? {});

      const qualityScore = computeQualityScore({
        gpsAccuracy: data.gpsAccuracyMeters,
        photoTypes,
      });

      // CHANGED - upload every photo before creating a lead row so a failed upload cannot leave a submitted lead.
      let uploaded: Awaited<ReturnType<typeof uploadPhotoFields>>;
      try {
        uploaded = await uploadPhotoFields(files ?? {});
      } catch (err) {
        // NEW - return the storage provider's actionable upload error to the Driver queue.
        throw new AppError(502, err instanceof Error ? err.message : "Photo upload failed");
      }

      // NEW - commit the lead and all photo URL rows atomically after uploads finish.
      const lead = await db.transaction(async tx => {
        const [insertedLead] = await tx
          .insert(leads)
          .values({
            // CHANGED - write validated lead data and persist a driver override for admin review.
            ...leadData,
            locationLat: String(leadData.locationLat),
            locationLng: String(leadData.locationLng),
            gpsAccuracyMeters: leadData.gpsAccuracyMeters ? String(leadData.gpsAccuracyMeters) : undefined,
            driverId: req.user!.sub,
            qualityScore,
            needsDuplicateReview: Boolean(nearbyLead && submitAsDifferentSite),
          })
          .returning();

        const photoRows = uploaded.map(({ photoType, storageUrl }) => ({
          leadId: insertedLead.id,
          photoType,
          storageUrl,
        }));
        if (photoRows.length) await tx.insert(leadPhotos).values(photoRows);
        return insertedLead;
      });

      await logActivity({
        userId: req.user!.sub,
        cityId: leadData.cityId,
        action: "lead.created",
        entityType: "lead",
        entityId: lead.id,
        // CHANGED - include whether the driver explicitly requested duplicate review.
        metadata: { phase: leadData.phase, photoCount: uploaded.length, needsDuplicateReview: Boolean(nearbyLead && submitAsDifferentSite) },
      });

      // CHANGED - the client marks received only after this explicit HTTP 200 confirmation.
      res.status(200).json({ ...lead, photoCount: uploaded.length, confirmed: true, message: "Lead received successfully" });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/leads
leadsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    const conditions = [];
    if (q.city_id) conditions.push(eq(leads.cityId, q.city_id));
    if (q.zone_id) conditions.push(eq(leads.zoneId, q.zone_id));
    if (q.district_id) conditions.push(eq(leads.districtId, q.district_id));
    // Drivers can only see their own leads — force filter regardless of query params
    if (req.user!.role === "driver") {
      conditions.push(eq(leads.driverId, req.user!.sub));
    } else if (q.driver_id) {
      conditions.push(eq(leads.driverId, q.driver_id));
    }
    if (q.status) conditions.push(eq(leads.status, q.status as typeof leads.status._.data));
    if (q.phase) conditions.push(eq(leads.phase, q.phase as typeof leads.phase._.data));
    if (q.date) conditions.push(sql`date(${leads.createdAt}) = ${q.date}`);

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ count: count() })
      .from(leads)
      .where(whereClause);

    const rows = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(Number(q.limit ?? 100))
      .offset(Number(q.offset ?? 0));

    res.json({ total: totalRow.count, leads: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/leads/:id
leadsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const [lead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
    if (!lead) throw new AppError(404, "Lead not found");

    // Drivers can only view their own leads
    if (req.user!.role === "driver" && lead.driverId !== req.user!.sub) {
      throw new AppError(403, "Access denied");
    }

    const photos = await db.select().from(leadPhotos).where(eq(leadPhotos.leadId, lead.id));

    const [driver] = lead.driverId
      ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, lead.driverId)).limit(1)
      : [null];

    res.json({ ...lead, photos, driverName: driver?.fullName });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/leads/:id/approve
leadsRouter.patch("/:id/approve", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    // NEW - approval is server-gated by an exact duplicate check and explicit admin decision.
    const { duplicateDecision } = z.object({
      duplicateDecision: z.enum(["approve_unique", "mark_duplicate"]).optional(),
    }).parse(req.body ?? {});
    const [currentLead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
    if (!currentLead) throw new AppError(404, "Lead not found");
    const nearbyLead = await findNearestApprovedLead(
      Number(currentLead.locationLat),
      Number(currentLead.locationLng),
      currentLead.id,
    );

    if (nearbyLead && !duplicateDecision) {
      const comparisonLead = await getLeadComparisonSummary(currentLead.id, nearbyLead.distanceMeters);
      return res.json({
        requiresDuplicateDecision: true,
        currentLead: comparisonLead,
        nearbyLead,
        distanceMeters: nearbyLead.distanceMeters,
      });
    }

    if (!nearbyLead && duplicateDecision === "mark_duplicate") {
      throw new AppError(409, "No approved lead exists within 100 meters");
    }

    // CHANGED - store duplicate as its own status and retain the original approved lead link.
    const isDuplicate = duplicateDecision === "mark_duplicate";
    const [lead] = await db
      .update(leads)
      .set({
        status: isDuplicate ? "duplicate" : "approved",
        needsDuplicateReview: false,
        duplicateOfLeadId: isDuplicate ? nearbyLead!.id : null,
        reviewedBy: req.user!.sub,
        reviewedAt: new Date(),
      })
      .where(eq(leads.id, req.params.id))
      .returning();
    // CHANGED - audit the actual unique/duplicate decision rather than recording every result as approved.
    await logActivity({
      userId: req.user!.sub,
      cityId: lead.cityId,
      action: isDuplicate ? "lead.marked_duplicate" : "lead.approved",
      entityType: "lead",
      entityId: lead.id,
      metadata: isDuplicate ? { duplicateOfLeadId: nearbyLead!.id, distanceMeters: nearbyLead!.distanceMeters } : undefined,
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/leads/:id/reject
leadsRouter.patch("/:id/reject", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const [lead] = await db
      .update(leads)
      .set({ status: "rejected", rejectReason: reason, reviewedBy: req.user!.sub, reviewedAt: new Date() })
      .where(eq(leads.id, req.params.id))
      .returning();
    if (!lead) throw new AppError(404, "Lead not found");
    await logActivity({ userId: req.user!.sub, cityId: lead.cityId, action: "lead.rejected", entityType: "lead", entityId: lead.id, metadata: { reason } });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/leads/:id/sent-to-client
leadsRouter.patch("/:id/sent-to-client", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const [lead] = await db
      .update(leads)
      .set({ status: "sent_to_client" })
      .where(eq(leads.id, req.params.id))
      .returning();
    if (!lead) throw new AppError(404, "Lead not found");
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/leads/:id
leadsRouter.delete("/:id", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const photos = await db.select({ storageUrl: leadPhotos.storageUrl }).from(leadPhotos).where(eq(leadPhotos.leadId, req.params.id));
    await deleteFilesByUrls(photos.map(p => p.storageUrl));
    const [lead] = await db.delete(leads).where(eq(leads.id, req.params.id)).returning();
    if (!lead) throw new AppError(404, "Lead not found");
    await logActivity({ userId: req.user!.sub, cityId: lead.cityId, action: "lead.deleted", entityType: "lead", entityId: lead.id });
    res.json({ ok: true, deleted: lead.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/leads/:id/photos
leadsRouter.post(
  "/:id/photos",
  requireAuth,
  upload.fields([
    { name: "billboard", maxCount: 5 },
    { name: "front", maxCount: 5 },
    { name: "side", maxCount: 5 },
    { name: "contractor_board", maxCount: 5 },
    { name: "selfie_checkin", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      // Verify the lead exists and belongs to the authenticated user (if driver)
      const [lead] = await db.select({ id: leads.id, driverId: leads.driverId }).from(leads).where(eq(leads.id, req.params.id)).limit(1);
      if (!lead) throw new AppError(404, "Lead not found");
      if (req.user!.role === "driver" && lead.driverId !== req.user!.sub) {
        throw new AppError(403, "You can only add photos to your own leads");
      }

      const files = req.files as Record<string, Express.Multer.File[]>;
      if (!Object.keys(files ?? {}).length) throw new AppError(400, "No photos uploaded");
      const uploaded = await uploadPhotoFields(files);
      const photoRows = uploaded.map(({ photoType, storageUrl }) => ({
        leadId: req.params.id,
        photoType,
        storageUrl,
      }));
      const inserted = await db.insert(leadPhotos).values(photoRows).returning();
      res.status(201).json({ added: inserted.length, photos: inserted });
    } catch (err) {
      next(err);
    }
  },
);
