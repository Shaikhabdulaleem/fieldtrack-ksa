import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";

export const notificationsRouter = Router();

// POST /api/v1/notifications/push
notificationsRouter.post("/notifications/push", requireAuth, requireRole("super_admin", "city_manager"), (req, res) => {
  const { driverIds } = req.body;
  // Stub: integrate FCM / OneSignal here
  res.json({ queued: true, recipients: driverIds?.length ?? 0 });
});

// POST /api/v1/whatsapp/lead-summary
notificationsRouter.post("/whatsapp/lead-summary", requireAuth, requireRole("super_admin", "city_manager"), (req, res) => {
  // Stub: integrate Twilio / WhatsApp Cloud API here
  res.json({ queued: true });
});

// POST /api/v1/whatsapp/daily-report
notificationsRouter.post("/whatsapp/daily-report", requireAuth, requireRole("super_admin", "city_manager"), (req, res) => {
  // Stub: integrate Twilio / WhatsApp Cloud API here
  res.json({ queued: true });
});
