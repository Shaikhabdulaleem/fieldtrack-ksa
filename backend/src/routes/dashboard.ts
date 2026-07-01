import { Router } from "express";
import { db } from "../db";
import { cities, users, leads, streets, driverAssignments, driverLocationPings, activityLogs } from "../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../middleware/error";

export const dashboardRouter = Router();

// All dashboard routes require auth first, then role check
dashboardRouter.use(requireAuth, requireRole("city_manager", "super_admin"));

// GET /api/v1/dashboard/stats?city_id=
dashboardRouter.get("/dashboard/stats", async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };
    const cityFilter = city_id ? sql`WHERE city_id = ${city_id}` : sql``;
    const cityFilterAnd = city_id ? sql`AND city_id = ${city_id}` : sql``;

    const [totals] = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM leads ${cityFilter}) as total_leads,
        (SELECT count(*) FROM leads WHERE status = 'new' ${cityFilterAnd}) as pending_leads,
        (SELECT count(*) FROM leads WHERE status = 'approved' ${cityFilterAnd}) as approved_leads,
        (SELECT count(*) FROM leads WHERE status = 'rejected' ${cityFilterAnd}) as rejected_leads,
        (SELECT count(*) FROM leads WHERE status = 'sent_to_client' ${cityFilterAnd}) as sent_to_client,
        (SELECT count(*) FROM leads WHERE date(created_at) = CURRENT_DATE ${cityFilterAnd}) as leads_today,
        (SELECT count(*) FROM users WHERE role = 'driver' AND is_active = true ${cityFilterAnd}) as active_drivers,
        (SELECT count(*) FROM users WHERE role = 'driver' ${cityFilterAnd}) as total_drivers,
        (SELECT count(*) FROM streets ${cityFilter}) as total_streets,
        (SELECT count(*) FROM streets WHERE status = 'completed' ${cityFilterAnd}) as completed_streets,
        (SELECT count(*) FROM streets WHERE status = 'assigned' ${cityFilterAnd}) as assigned_streets,
        (SELECT count(*) FROM streets WHERE status = 'not_assigned' ${cityFilterAnd}) as unassigned_streets,
        (SELECT avg(quality_score) FROM leads ${cityFilter}) as avg_quality_score
    `);

    res.json(totals);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/dashboard/leads-by-day?city_id=&days=
dashboardRouter.get("/dashboard/leads-by-day", async (req, res, next) => {
  try {
    const { city_id, days } = req.query as { city_id?: string; days?: string };
    const numDays = Number(days ?? 30);

    const rows = await db.execute(sql`
      SELECT
        date(created_at) as date,
        count(*) as total,
        count(*) filter (where status = 'approved') as approved,
        count(*) filter (where status = 'rejected') as rejected,
        count(*) filter (where status = 'new') as pending
      FROM leads
      WHERE created_at >= CURRENT_DATE - ${numDays}::int
        ${city_id ? sql`AND city_id = ${city_id}` : sql``}
      GROUP BY date(created_at)
      ORDER BY date DESC
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/dashboard/top-drivers?city_id=&limit=
dashboardRouter.get("/dashboard/top-drivers", async (req, res, next) => {
  try {
    const { city_id, limit } = req.query as { city_id?: string; limit?: string };

    const rows = await db.execute(sql`
      SELECT
        u.id,
        u.full_name,
        u.city_id,
        count(l.id) as total_leads,
        count(l.id) filter (where l.status = 'approved') as approved_leads,
        count(distinct da.street_id) filter (where da.status = 'completed') as streets_completed,
        avg(l.quality_score) as avg_quality_score
      FROM users u
      LEFT JOIN leads l ON l.driver_id = u.id
      LEFT JOIN driver_assignments da ON da.driver_id = u.id
      WHERE u.role = 'driver'
        ${city_id ? sql`AND u.city_id = ${city_id}` : sql``}
      GROUP BY u.id, u.full_name, u.city_id
      ORDER BY total_leads DESC
      LIMIT ${Number(limit ?? 10)}
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/dashboard/recent-activity?city_id=&limit=
dashboardRouter.get("/dashboard/recent-activity", async (req, res, next) => {
  try {
    const { city_id, limit } = req.query as { city_id?: string; limit?: string };

    const conditions = [];
    if (city_id) conditions.push(eq(activityLogs.cityId, city_id));

    const rows = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        metadata: activityLogs.metadata,
        createdAt: activityLogs.createdAt,
        userName: users.fullName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(activityLogs.createdAt))
      .limit(Number(limit ?? 20));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/dashboard/city-overview
dashboardRouter.get("/dashboard/city-overview", async (_req, res, next) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        c.id,
        c.name_en,
        c.name_ar,
        c.region_en,
        c.center_lat,
        c.center_lng,
        (SELECT count(*) FROM users WHERE city_id = c.id AND role = 'driver' AND is_active = true) as active_drivers,
        (SELECT count(*) FROM leads WHERE city_id = c.id) as total_leads,
        (SELECT count(*) FROM leads WHERE city_id = c.id AND date(created_at) = CURRENT_DATE) as leads_today,
        (SELECT count(*) FROM streets WHERE city_id = c.id) as total_streets,
        (SELECT count(*) FROM streets WHERE city_id = c.id AND status = 'completed') as completed_streets,
        CASE
          WHEN (SELECT count(*) FROM streets WHERE city_id = c.id) > 0
          THEN round(100.0 * (SELECT count(*) FROM streets WHERE city_id = c.id AND status = 'completed') / (SELECT count(*) FROM streets WHERE city_id = c.id), 1)
          ELSE 0
        END as coverage_pct
      FROM cities c
      WHERE c.is_active = true
        AND (SELECT count(*) FROM users WHERE city_id = c.id AND role = 'driver') > 0
      ORDER BY c.name_en
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/cities/:id/planning
dashboardRouter.get("/cities/:id/planning", async (req, res, next) => {
  try {
    const cityId = req.params.id;
    const today = new Date().toISOString().slice(0, 10);

    const [city] = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!city) throw new AppError(404, "City not found");

    const cityDrivers = await db.execute(sql`
      SELECT
        u.id,
        u.full_name,
        u.phone,
        u.iqama_number,
        u.car_plate_number,
        u.is_active,
        (SELECT count(*) FROM driver_assignments WHERE driver_id = u.id AND assigned_date = ${today}) as today_assigned,
        (SELECT count(*) FROM driver_assignments WHERE driver_id = u.id AND assigned_date = ${today} AND status = 'completed') as today_completed,
        (SELECT count(*) FROM driver_assignments WHERE driver_id = u.id AND assigned_date = ${today} AND status = 'in_progress') as today_in_progress,
        (SELECT count(*) FROM driver_assignments WHERE driver_id = u.id AND assigned_date = ${today} AND status = 'skipped') as today_skipped,
        (SELECT count(*) FROM leads WHERE driver_id = u.id AND date(created_at) = ${today}) as today_leads,
        (SELECT count(*) FROM leads WHERE driver_id = u.id) as total_leads,
        (SELECT count(*) FROM leads WHERE driver_id = u.id AND status = 'approved') as approved_leads,
        (SELECT count(*) FROM driver_assignments WHERE driver_id = u.id AND status = 'completed') as total_streets_completed,
        (SELECT avg(quality_score) FROM leads WHERE driver_id = u.id) as avg_quality_score
      FROM users u
      WHERE u.city_id = ${cityId} AND u.role = 'driver'
      ORDER BY u.full_name
    `);

    const [streetStats] = await db.execute(sql`
      SELECT
        count(*) as total_streets,
        count(*) filter (where status = 'completed') as completed,
        count(*) filter (where status = 'assigned') as assigned,
        count(*) filter (where status = 'in_progress') as in_progress,
        count(*) filter (where status = 'skipped') as skipped,
        count(*) filter (where status = 'not_assigned') as unassigned
      FROM streets
      WHERE city_id = ${cityId}
    `);

    const [todayStats] = await db.execute(sql`
      SELECT
        count(*) as total_assigned_today,
        count(*) filter (where status = 'completed') as completed_today,
        count(*) filter (where status = 'in_progress') as in_progress_today,
        count(*) filter (where status = 'skipped') as skipped_today
      FROM driver_assignments
      WHERE city_id = ${cityId} AND assigned_date = ${today}
    `);

    const zoneBreakdown = await db.execute(sql`
      SELECT
        z.id as zone_id,
        z.name_en as zone_name_en,
        z.name_ar as zone_name_ar,
        (SELECT count(*) FROM streets s JOIN districts d ON s.district_id = d.id WHERE d.zone_id = z.id) as total_streets,
        (SELECT count(*) FROM streets s JOIN districts d ON s.district_id = d.id WHERE d.zone_id = z.id AND s.status = 'completed') as completed_streets,
        (SELECT count(*) FROM streets s JOIN districts d ON s.district_id = d.id WHERE d.zone_id = z.id AND s.status = 'not_assigned') as unassigned_streets
      FROM zones z
      WHERE z.city_id = ${cityId}
      ORDER BY z.name_en
    `);

    const districtBreakdown = await db.execute(sql`
      SELECT
        d.id as district_id,
        d.name_en as district_name_en,
        d.name_ar as district_name_ar,
        d.zone_id,
        d.center_lat,
        d.center_lng,
        d.boundary,
        (SELECT count(*) FROM streets WHERE district_id = d.id) as total_streets,
        (SELECT count(*) FROM streets WHERE district_id = d.id AND status = 'completed') as completed_streets,
        (SELECT count(*) FROM streets WHERE district_id = d.id AND status = 'assigned') as assigned_streets,
        (SELECT count(*) FROM streets WHERE district_id = d.id AND status = 'in_progress') as in_progress_streets,
        (SELECT count(*) FROM streets WHERE district_id = d.id AND status = 'not_assigned') as unassigned_streets
      FROM districts d
      WHERE d.city_id = ${cityId}
      ORDER BY d.name_en
    `);

    res.json({
      city,
      drivers: cityDrivers,
      streetStats: streetStats ?? {},
      todayStats: todayStats ?? {},
      zones: zoneBreakdown,
      districts: districtBreakdown,
      today,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/drivers/:id/assignment-history?days=30
dashboardRouter.get("/drivers/:id/assignment-history", async (req, res, next) => {
  try {
    const driverId = req.params.id;
    const days = Number(req.query.days ?? 30);

    const history = await db.execute(sql`
      SELECT
        da.assigned_date as date,
        count(*) as streets_assigned,
        count(*) filter (where da.status = 'completed') as streets_completed,
        count(*) filter (where da.status = 'skipped') as streets_skipped,
        (SELECT count(*) FROM leads WHERE driver_id = ${driverId} AND date(created_at) = da.assigned_date) as leads_submitted
      FROM driver_assignments da
      WHERE da.driver_id = ${driverId}
        AND da.assigned_date >= CURRENT_DATE - ${days}::int
      GROUP BY da.assigned_date
      ORDER BY da.assigned_date DESC
    `);

    const todayStreets = await db.execute(sql`
      SELECT
        da.id,
        da.status,
        da.started_at,
        da.completed_at,
        da.skipped_reason,
        da.district_id,
        s.name_en as street_name_en,
        s.name_ar as street_name_ar,
        d.name_en as district_name_en,
        d.name_ar as district_name_ar
      FROM driver_assignments da
      LEFT JOIN streets s ON s.id = da.street_id
      LEFT JOIN districts d ON d.id = da.district_id
      WHERE da.driver_id = ${driverId}
        AND da.assigned_date = CURRENT_DATE
      ORDER BY d.name_en, s.name_en
    `);

    res.json({ history, todayStreets });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/locate?lat=&lng= — find district/zone/city by GPS coordinates (point-in-polygon)
dashboardRouter.get("/locate", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return res.json({ city: null, district: null, zone: null });
    }

    const allDistricts = await db.execute(sql`
      SELECT
        d.id, d.name_en as district_name, d.name_ar as district_name_ar,
        d.boundary, d.city_id,
        c.name_en as city_name,
        z.name_en as zone_name
      FROM districts d
      LEFT JOIN cities c ON c.id = d.city_id
      LEFT JOIN zones z ON z.id = d.zone_id
      WHERE d.boundary IS NOT NULL
    `);

    let match: Record<string, unknown> | null = null;

    for (const dist of allDistricts) {
      const boundary = dist.boundary as number[][];
      if (!boundary || !Array.isArray(boundary) || boundary.length < 3) continue;

      // Point-in-polygon using ray casting algorithm
      let inside = false;
      for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
        const xi = boundary[i][0], yi = boundary[i][1];
        const xj = boundary[j][0], yj = boundary[j][1];
        const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }

      if (inside) {
        match = dist;
        break;
      }
    }

    if (match) {
      // Find nearest street in this district
      const nearbyStreets = await db
        .select({ nameEn: streets.nameEn })
        .from(streets)
        .where(eq(streets.districtId, String(match.id)))
        .limit(1);

      res.json({
        city: String(match.city_name ?? ""),
        district: String(match.district_name ?? ""),
        districtAr: String(match.district_name_ar ?? ""),
        zone: String(match.zone_name ?? ""),
        nearestStreet: nearbyStreets[0]?.nameEn ?? "",
      });
    } else {
      res.json({ city: null, district: null, zone: null, nearestStreet: null });
    }
  } catch (err) {
    next(err);
  }
});
