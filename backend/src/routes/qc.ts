import { Router } from "express";
import { db } from "../db";
import { leads } from "../db/schema";
import { eq, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { checkBlur, checkDuplicate, checkGpsStreetMatch } from "../services/qc.service";
import { AppError } from "../middleware/error";

export const qcRouter = Router();

// GET /api/v1/qc/queue — leads needing review
qcRouter.get("/queue", requireAuth, requireRole("super_admin", "city_manager"), async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(leads)
      .where(or(eq(leads.status, "new"), eq(leads.status, "reviewed")))
      .orderBy(leads.createdAt);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/qc/photo-blur-check
qcRouter.post("/photo-blur-check", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { leadId } = req.body as { leadId: string };
    if (!leadId) throw new AppError(400, "leadId required");
    const result = await checkBlur(leadId);
    await db.update(leads).set({ status: "reviewed" }).where(eq(leads.id, leadId));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/qc/duplicate-check
qcRouter.post("/duplicate-check", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { leadId } = req.body as { leadId: string };
    if (!leadId) throw new AppError(400, "leadId required");
    const result = await checkDuplicate(leadId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/qc/gps-street-match
qcRouter.post("/gps-street-match", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { leadId } = req.body as { leadId: string };
    if (!leadId) throw new AppError(400, "leadId required");
    const result = await checkGpsStreetMatch(leadId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
