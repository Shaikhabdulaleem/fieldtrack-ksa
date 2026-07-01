import { Router } from "express";
import { db } from "../db";
import { leads, users, streets, driverAssignments } from "../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { toXlsx, toCsv, toPdf } from "../services/export.service";

export const reportsRouter = Router();

// All report and export routes require auth first, then role check
reportsRouter.use(requireAuth, requireRole("city_manager", "super_admin"));

// GET /api/v1/reports/summary?city_id=&from=&to=
reportsRouter.get("/reports/summary", async (req, res, next) => {
  try {
    const { city_id, from, to } = req.query as Record<string, string>;
    const conditions = [];
    if (city_id) conditions.push(eq(leads.cityId, city_id));
    if (from) conditions.push(sql`${leads.createdAt} >= ${from}`);
    if (to) conditions.push(sql`${leads.createdAt} <= ${to}::date + interval '1 day'`);

    const rows = await db.execute(sql`
      SELECT
        date(created_at) as date,
        count(*) as total,
        count(*) filter (where status = 'approved') as approved,
        count(*) filter (where status = 'rejected') as rejected,
        count(*) filter (where status = 'new') as pending
      FROM leads
      ${conditions.length ? sql`WHERE ${and(...conditions)}` : sql``}
      GROUP BY date(created_at)
      ORDER BY date DESC
      LIMIT 90
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reports/drivers?city_id=
reportsRouter.get("/reports/drivers", async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };

    const rows = await db.execute(sql`
      SELECT
        u.id,
        u.full_name,
        u.city_id,
        count(l.id) as total_leads,
        count(l.id) filter (where l.status = 'approved') as approved_leads,
        count(da.id) filter (where da.status = 'completed') as streets_completed
      FROM users u
      LEFT JOIN leads l ON l.driver_id = u.id
      LEFT JOIN driver_assignments da ON da.driver_id = u.id
      WHERE u.role = 'driver'
      ${city_id ? sql`AND u.city_id = ${city_id}` : sql``}
      GROUP BY u.id, u.full_name, u.city_id
      ORDER BY total_leads DESC
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reports/coverage?city_id=
reportsRouter.get("/reports/coverage", async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };

    const rows = await db.execute(sql`
      SELECT
        city_id,
        count(*) as total_streets,
        count(*) filter (where status = 'completed') as completed,
        count(*) filter (where status = 'assigned') as assigned,
        count(*) filter (where status = 'not_assigned') as not_assigned,
        round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*), 0), 1) as coverage_pct
      FROM streets
      ${city_id ? sql`WHERE city_id = ${city_id}` : sql``}
      GROUP BY city_id
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/exports/leads.xlsx
reportsRouter.get("/exports/leads.xlsx", async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };
    const rows = await db
      .select()
      .from(leads)
      .where(city_id ? eq(leads.cityId, city_id) : undefined)
      .orderBy(desc(leads.createdAt))
      .limit(5000);

    const buf = toXlsx(rows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=leads.xlsx");
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/exports/leads.csv
reportsRouter.get("/exports/leads.csv", async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };
    const rows = await db
      .select()
      .from(leads)
      .where(city_id ? eq(leads.cityId, city_id) : undefined)
      .orderBy(desc(leads.createdAt))
      .limit(5000);

    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/exports/leads.pdf
reportsRouter.get("/exports/leads.pdf", async (req, res, next) => {
  try {
    const { city_id } = req.query as { city_id?: string };
    const rows = await db
      .select()
      .from(leads)
      .where(city_id ? eq(leads.cityId, city_id) : undefined)
      .orderBy(desc(leads.createdAt))
      .limit(500);

    const pdf = toPdf(rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=leads.pdf");
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});
