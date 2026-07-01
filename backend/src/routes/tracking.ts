import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { driverLocationPings, trackingAlertAcks, users, leads, leadPhotos, streets } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../middleware/error";

export const trackingRouter = Router();

// POST /api/v1/tracking/ping
trackingRouter.post("/ping", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      speedKmh: z.number().min(0).max(300).optional(),
      accuracyMeters: z.number().optional(),
      batteryPercent: z.number().int().min(0).max(100).optional(),
    });
    const { lat, lng, speedKmh, accuracyMeters, batteryPercent } = schema.parse(req.body);
    const driverId = req.user!.sub;
    const lowAccuracy = typeof accuracyMeters === "number" && accuracyMeters > 50;

    const [driver] = await db
      .select({ cityId: users.cityId })
      .from(users)
      .where(eq(users.id, driverId))
      .limit(1);

    const [ping] = await db
      .insert(driverLocationPings)
      .values({
        driverId,
        cityId: driver?.cityId ?? undefined,
        locationLat: String(lat),
        locationLng: String(lng),
        speedKmh: speedKmh ? String(speedKmh) : undefined,
        accuracyMeters: accuracyMeters ? String(accuracyMeters) : undefined,
        lowAccuracy,
        batteryPercent,
      })
      .returning();

    res.json({ ok: true, pingId: ping.id, recordedAt: ping.recordedAt });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tracking/live?city_id=
trackingRouter.get("/live", requireAuth, requireRole("city_manager", "super_admin"), async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };

    // Latest ping per driver using a subquery
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (dlp.driver_id)
        dlp.driver_id,
        u.full_name,
        u.city_id,
        dlp.location_lat,
        dlp.location_lng,
        dlp.speed_kmh,
        dlp.battery_percent,
        dlp.recorded_at
      FROM driver_location_pings dlp
      JOIN users u ON u.id = dlp.driver_id
      ${city_id ? sql`WHERE dlp.city_id = ${city_id}` : sql``}
      ORDER BY dlp.driver_id, dlp.recorded_at DESC
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tracking/drivers/:id/history?date=
trackingRouter.get("/drivers/:id/history", requireAuth, async (req, res, next) => {
  try {
    // Drivers can only access their own history; managers can access any
    if (req.user!.role === "driver" && req.user!.sub !== req.params.id) {
      return next(new AppError(403, "You can only view your own location history"));
    }
    const { date } = req.query as { date?: string };
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    const rows = await db
      .select()
      .from(driverLocationPings)
      .where(
        and(
          eq(driverLocationPings.driverId, req.params.id),
          sql`date(recorded_at) = ${targetDate}`,
        ),
      )
      .orderBy(desc(driverLocationPings.recordedAt));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tracking/district-activity?district_id=&driver_id=&date=
trackingRouter.get("/district-activity", requireAuth, requireRole("city_manager", "super_admin"), async (req, res, next) => {
  try {
    const { district_id, driver_id, date } = req.query as Record<string, string>;
    if (!district_id || !driver_id) {
      return res.status(400).json({ error: "district_id and driver_id are required" });
    }
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    const [pings, districtLeads, districtStreets] = await Promise.all([
      db
        .select({
          lat: driverLocationPings.locationLat,
          lng: driverLocationPings.locationLng,
          recordedAt: driverLocationPings.recordedAt,
          speedKmh: driverLocationPings.speedKmh,
        })
        .from(driverLocationPings)
        .where(
          and(
            eq(driverLocationPings.driverId, driver_id),
            sql`date(recorded_at) = ${targetDate}`,
          ),
        )
        .orderBy(driverLocationPings.recordedAt),

      db.execute(sql`
        SELECT
          l.id, l.site_name, l.phase, l.location_lat, l.location_lng,
          l.status, l.created_at,
          COALESCE(
            json_agg(
              json_build_object('storageUrl', lp.storage_url, 'photoType', lp.photo_type)
            ) FILTER (WHERE lp.id IS NOT NULL),
            '[]'
          ) AS photos
        FROM leads l
        LEFT JOIN lead_photos lp ON lp.lead_id = l.id
        WHERE l.district_id = ${district_id}
          AND l.driver_id = ${driver_id}
          AND date(l.created_at) = ${targetDate}
        GROUP BY l.id
        ORDER BY l.created_at
      `),

      db
        .select({
          id: streets.id,
          nameEn: streets.nameEn,
          nameAr: streets.nameAr,
          status: streets.status,
        })
        .from(streets)
        .where(eq(streets.districtId, district_id)),
    ]);

    res.json({
      pings,
      leads: districtLeads,
      streets: districtStreets,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tracking/alerts?city_id=
trackingRouter.get("/alerts", requireAuth, requireRole("city_manager", "super_admin"), async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };

    // Silence alerts: active drivers with no ping in last 20 min
    const silenceRows = await db.execute(sql`
      SELECT
        u.id as driver_id,
        u.full_name,
        u.city_id,
        'silence' as alert_type,
        MAX(dlp.recorded_at) as last_ping,
        EXTRACT(EPOCH FROM (NOW() - MAX(dlp.recorded_at))) / 60 as minutes_since_ping,
        NULL::int as deviation_meters,
        false as acknowledged
      FROM users u
      LEFT JOIN driver_location_pings dlp ON dlp.driver_id = u.id
      WHERE u.role = 'driver' AND u.is_active = true
        ${city_id ? sql`AND u.city_id = ${city_id}` : sql``}
      GROUP BY u.id, u.full_name, u.city_id
      HAVING MAX(dlp.recorded_at) IS NULL OR MAX(dlp.recorded_at) < NOW() - INTERVAL '20 minutes'
      ORDER BY last_ping ASC NULLS FIRST
    `);

    // Deviation alerts: 3 consecutive non-low-accuracy pings all >150m from district center
    const deviationRows = await db.execute(sql`
      WITH driver_district AS (
        SELECT DISTINCT ON (da.driver_id)
          da.driver_id,
          d.center_lat::float as center_lat,
          d.center_lng::float as center_lng
        FROM driver_assignments da
        JOIN districts d ON d.id = da.district_id
        WHERE da.assigned_date = CURRENT_DATE
          AND da.status IN ('assigned', 'in_progress')
      ),
      recent_pings AS (
        SELECT
          dlp.driver_id,
          dlp.location_lat::float as lat,
          dlp.location_lng::float as lng,
          ROW_NUMBER() OVER (PARTITION BY dlp.driver_id ORDER BY dlp.recorded_at DESC) as rn
        FROM driver_location_pings dlp
        WHERE date(dlp.recorded_at) = CURRENT_DATE
          AND (dlp.low_accuracy IS NULL OR dlp.low_accuracy = false)
      ),
      distances AS (
        SELECT p.driver_id,
          (6371000 * acos(LEAST(1.0,
            cos(radians(dd.center_lat)) * cos(radians(p.lat)) *
            cos(radians(p.lng) - radians(dd.center_lng)) +
            sin(radians(dd.center_lat)) * sin(radians(p.lat))
          )))::int as dist_m
        FROM recent_pings p
        JOIN driver_district dd ON dd.driver_id = p.driver_id
        WHERE p.rn <= 3
      ),
      deviating AS (
        SELECT driver_id, MAX(dist_m) as deviation_meters
        FROM distances
        GROUP BY driver_id
        HAVING COUNT(*) = 3 AND MIN(dist_m) > 150
      )
      SELECT
        u.id as driver_id,
        u.full_name,
        u.city_id,
        'deviation' as alert_type,
        NULL as last_ping,
        NULL as minutes_since_ping,
        dev.deviation_meters,
        (ack.id IS NOT NULL) as acknowledged
      FROM deviating dev
      JOIN users u ON u.id = dev.driver_id
      LEFT JOIN tracking_alert_acks ack
        ON ack.driver_id = dev.driver_id AND ack.alert_date = CURRENT_DATE
      WHERE 1=1
        ${city_id ? sql`AND u.city_id = ${city_id}` : sql``}
    `);

    res.json([...silenceRows, ...deviationRows]);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tracking/alerts/acknowledge
trackingRouter.post(
  "/alerts/acknowledge",
  requireAuth,
  requireRole("city_manager", "super_admin"),
  async (req, res, next) => {
    try {
      const schema = z.object({
        driverId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const { driverId, date } = schema.parse(req.body);
      const todayStr = new Date().toISOString().slice(0, 10);
      const alertDate = date ?? todayStr;

      await db
        .insert(trackingAlertAcks)
        .values({
          driverId,
          alertDate,
          acknowledgedBy: req.user!.sub,
        })
        .onConflictDoNothing();

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);
