import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";

export const notificationsRouter = Router();

// POST /api/v1/notifications/push
notificationsRouter.post("/notifications/push", requireAuth, requireRole("super_admin", "city_manager"), (req, res) => {
  const { title, body, driverIds } = req.body;
  // Stub: swap body for FCM / OneSignal integration
  console.log("[Push]", { title, body, driverIds });
  res.json({ queued: true, recipients: driverIds?.length ?? 0 });
});

// POST /api/v1/whatsapp/lead-summary
notificationsRouter.post("/whatsapp/lead-summary", requireAuth, requireRole("super_admin", "city_manager"), (req, res) => {
  const { leadId, clientPhone } = req.body;
  // Stub: swap for Twilio / WhatsApp Cloud API
  console.log("[WhatsApp] Lead summary", { leadId, clientPhone });
  res.json({ queued: true });
});

// POST /api/v1/whatsapp/daily-report
notificationsRouter.post("/whatsapp/daily-report", requireAuth, requireRole("super_admin", "city_manager"), (req, res) => {
  const { cityId, adminPhone } = req.body;
  // Stub: swap for Twilio / WhatsApp Cloud API
  console.log("[WhatsApp] Daily report", { cityId, adminPhone });
  res.json({ queued: true });
});
