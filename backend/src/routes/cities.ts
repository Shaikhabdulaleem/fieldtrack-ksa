import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { cities, zones, districts, streets, users, leads } from "../db/schema";
import { eq, and, count, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../services/activity.service";
import { AppError } from "../middleware/error";

export const citiesRouter = Router();

// GET /api/v1/cities
citiesRouter.get("/cities", requireAuth, async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: cities.id,
        nameEn: cities.nameEn,
        nameAr: cities.nameAr,
        regionEn: cities.regionEn,
        centerLat: cities.centerLat,
        centerLng: cities.centerLng,
        estimatedNamedStreets: cities.estimatedNamedStreets,
        isActive: cities.isActive,
        driverCount: sql<number>`(select count(*) from users where city_id = cities.id and role = 'driver' and is_active = true)`.mapWith(Number),
        leadCount: sql<number>`(select count(*) from leads where city_id = cities.id)`.mapWith(Number),
      })
      .from(cities)
      .where(eq(cities.isActive, true))
      .orderBy(cities.nameEn);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/cities
citiesRouter.post("/cities", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      nameEn: z.string().min(1),
      nameAr: z.string().optional(),
      regionEn: z.string().optional(),
      regionAr: z.string().optional(),
      centerLat: z.string().optional(),
      centerLng: z.string().optional(),
      estimatedNamedStreets: z.number().optional(),
    });
    const data = schema.parse(req.body);
    const [city] = await db.insert(cities).values(data).returning();
    res.status(201).json(city);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/cities/:id
citiesRouter.get("/cities/:id", requireAuth, async (req, res, next) => {
  try {
    const [city] = await db.select().from(cities).where(eq(cities.id, req.params.id)).limit(1);
    if (!city) throw new AppError(404, "City not found");

    const [driverCountRow] = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.cityId, req.params.id), eq(users.role, "driver")));

    const [leadCountRow] = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.cityId, req.params.id));

    res.json({ ...city, driverCount: driverCountRow.count, leadCount: leadCountRow.count });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/cities/:id
citiesRouter.patch("/cities/:id", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    if (req.user!.role === "city_manager" && req.user!.cityId !== req.params.id) {
      throw new AppError(403, "You can only edit your own city");
    }
    const schema = z.object({
      nameEn: z.string().min(1).optional(),
      nameAr: z.string().optional(),
      centerLat: z.string().optional(),
      centerLng: z.string().optional(),
      targetDays: z.number().int().min(1).optional(),
      targetLeadsPerDriver: z.number().int().min(0).optional(),
      maxStreetsPerDriver: z.number().int().min(1).optional(),
      // District-Based Driver Survey Coverage Planner inputs
      petrolPerDriverPerDay: z.number().min(0).optional(),
      petrolPricePerLiter: z.number().gt(0).optional(),
      avgCarMileageKmPerLiter: z.number().min(0).optional(),
      surveyEfficiencyPct: z.number().int().min(0).max(100).optional(),
    });
    const { petrolPerDriverPerDay, petrolPricePerLiter, avgCarMileageKmPerLiter, ...rest } = schema.parse(req.body);
    const data: Record<string, unknown> = { ...rest };
    // numeric() columns are typed as string in drizzle — convert explicitly.
    if (petrolPerDriverPerDay !== undefined) data.petrolPerDriverPerDay = petrolPerDriverPerDay.toFixed(2);
    if (petrolPricePerLiter !== undefined) data.petrolPricePerLiter = petrolPricePerLiter.toFixed(2);
    if (avgCarMileageKmPerLiter !== undefined) data.avgCarMileageKmPerLiter = avgCarMileageKmPerLiter.toFixed(2);
    const [city] = await db
      .update(cities)
      .set(data)
      .where(eq(cities.id, req.params.id))
      .returning();
    if (!city) throw new AppError(404, "City not found");
    res.json(city);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/cities/:city_id/zones
citiesRouter.get("/cities/:city_id/zones", requireAuth, async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: zones.id,
        nameEn: zones.nameEn,
        nameAr: zones.nameAr,
        cityId: zones.cityId,
        districtCount: sql<number>`(select count(*) from districts where zone_id = zones.id)`.mapWith(Number),
        streetCount: sql<number>`(select count(*) from streets s join districts d on s.district_id = d.id where d.zone_id = zones.id)`.mapWith(Number),
        completedStreets: sql<number>`(select count(*) from streets s join districts d on s.district_id = d.id where d.zone_id = zones.id and s.status = 'completed')`.mapWith(Number),
      })
      .from(zones)
      .where(eq(zones.cityId, req.params.city_id))
      .orderBy(zones.nameEn);

    const withCoverage = rows.map(r => ({
      ...r,
      coverage: r.streetCount > 0 ? Math.round((r.completedStreets / r.streetCount) * 100) : 0,
    }));

    res.json(withCoverage);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/zones/:id/districts
citiesRouter.get("/zones/:id/districts", requireAuth, async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(districts)
      .where(eq(districts.zoneId, req.params.id))
      .orderBy(districts.nameEn);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/districts/:id/streets
citiesRouter.get("/districts/:id/streets", requireAuth, async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(streets)
      .where(eq(streets.districtId, req.params.id))
      .orderBy(streets.nameEn);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/districts/:id/survey-zones — District-Based Driver Survey
// Coverage Planner's capacity-based zones for this district (distinct from
// the geographic `zones` table).
citiesRouter.get("/districts/:id/survey-zones", requireAuth, async (req, res, next) => {
  try {
    const rows = await db.execute(sql`
      SELECT sz.*, u.full_name as assigned_driver_name,
        (SELECT count(*)::int FROM streets WHERE survey_zone_id = sz.id) as street_count,
        (SELECT count(*)::int FROM streets WHERE survey_zone_id = sz.id AND status = 'completed') as completed_street_count
      FROM survey_zones sz
      LEFT JOIN users u ON sz.assigned_driver_id = u.id
      WHERE sz.district_id = ${req.params.id}
      ORDER BY sz.label
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Zone CRUD ──────────────────────────────────────────────────────────────

// POST /api/v1/cities/:city_id/zones
citiesRouter.post("/cities/:city_id/zones", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = z.object({ nameEn: z.string().min(1), nameAr: z.string().optional() }).parse(req.body);
    const [zone] = await db.insert(zones).values({ ...data, cityId: req.params.city_id }).returning();
    await logActivity({ userId: req.user!.sub, cityId: req.params.city_id, action: "zone.created", entityType: "zone", entityId: zone.id });
    res.status(201).json(zone);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/zones/:id
citiesRouter.patch("/zones/:id", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = z.object({ nameEn: z.string().min(1).optional(), nameAr: z.string().optional() }).parse(req.body);
    const [zone] = await db.update(zones).set(data).where(eq(zones.id, req.params.id)).returning();
    if (!zone) throw new AppError(404, "Zone not found");
    res.json(zone);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/zones/:id
citiesRouter.delete("/zones/:id", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const [zone] = await db.delete(zones).where(eq(zones.id, req.params.id)).returning();
    if (!zone) throw new AppError(404, "Zone not found");
    res.json({ ok: true, deleted: zone.id });
  } catch (err) {
    next(err);
  }
});

// ── District CRUD ──────────────────────────────────────────────────────────

// POST /api/v1/zones/:zone_id/districts
citiesRouter.post("/zones/:zone_id/districts", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = z.object({ nameEn: z.string().min(1), nameAr: z.string().optional() }).parse(req.body);
    const [zone] = await db.select({ cityId: zones.cityId }).from(zones).where(eq(zones.id, req.params.zone_id)).limit(1);
    if (!zone) throw new AppError(404, "Zone not found");
    const [district] = await db.insert(districts).values({ ...data, zoneId: req.params.zone_id, cityId: zone.cityId }).returning();
    await logActivity({ userId: req.user!.sub, cityId: zone.cityId, action: "district.created", entityType: "district", entityId: district.id });
    res.status(201).json(district);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/districts/:id
citiesRouter.patch("/districts/:id", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = z.object({ nameEn: z.string().min(1).optional(), nameAr: z.string().optional() }).parse(req.body);
    const [district] = await db.update(districts).set(data).where(eq(districts.id, req.params.id)).returning();
    if (!district) throw new AppError(404, "District not found");
    res.json(district);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/districts/:id
citiesRouter.delete("/districts/:id", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const [district] = await db.delete(districts).where(eq(districts.id, req.params.id)).returning();
    if (!district) throw new AppError(404, "District not found");
    res.json({ ok: true, deleted: district.id });
  } catch (err) {
    next(err);
  }
});

// ── Street CRUD ────────────────────────────────────────────────────────────

// POST /api/v1/districts/:district_id/streets
citiesRouter.post("/districts/:district_id/streets", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = z.object({ nameEn: z.string().optional(), nameAr: z.string().optional(), osmId: z.string().optional() }).parse(req.body);
    const [district] = await db.select({ cityId: districts.cityId }).from(districts).where(eq(districts.id, req.params.district_id)).limit(1);
    if (!district) throw new AppError(404, "District not found");
    const [street] = await db.insert(streets).values({ ...data, districtId: req.params.district_id, cityId: district.cityId }).returning();
    res.status(201).json(street);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/districts/:district_id/streets/bulk
citiesRouter.post("/districts/:district_id/streets/bulk", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const schema = z.object({
      streets: z.array(z.object({
        nameEn: z.string().optional(),
        nameAr: z.string().optional(),
        osmId: z.string().optional(),
      })).min(1).max(1000),
    });
    const { streets: streetList } = schema.parse(req.body);
    const [district] = await db.select({ cityId: districts.cityId }).from(districts).where(eq(districts.id, req.params.district_id)).limit(1);
    if (!district) throw new AppError(404, "District not found");

    const rows = await db
      .insert(streets)
      .values(streetList.map(s => ({ ...s, districtId: req.params.district_id, cityId: district.cityId })))
      .returning();

    await logActivity({
      userId: req.user!.sub,
      cityId: district.cityId,
      action: "streets.bulk_created",
      entityType: "street",
      metadata: { count: rows.length, districtId: req.params.district_id },
    });

    res.status(201).json({ created: rows.length, streets: rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/streets/:id
citiesRouter.patch("/streets/:id", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = z.object({
      nameEn: z.string().optional(),
      nameAr: z.string().optional(),
      status: z.enum(["not_assigned", "assigned", "in_progress", "completed", "skipped"]).optional(),
    }).parse(req.body);
    const [street] = await db.update(streets).set(data).where(eq(streets.id, req.params.id)).returning();
    if (!street) throw new AppError(404, "Street not found");
    res.json(street);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/streets/:id
citiesRouter.delete("/streets/:id", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const [street] = await db.delete(streets).where(eq(streets.id, req.params.id)).returning();
    if (!street) throw new AppError(404, "Street not found");
    res.json({ ok: true, deleted: street.id });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/cities/:city_id/streets?status=&limit=&offset=
citiesRouter.get("/cities/:city_id/streets", requireAuth, async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    const conditions = [eq(streets.cityId, req.params.city_id)];
    if (q.status) conditions.push(eq(streets.status, q.status as typeof streets.status._.data));

    const rows = await db
      .select()
      .from(streets)
      .where(and(...conditions))
      .orderBy(streets.nameEn)
      .limit(Number(q.limit ?? 200))
      .offset(Number(q.offset ?? 0));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});
