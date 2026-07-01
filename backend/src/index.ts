import "./config/env";
import { env } from "./config/env";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { errorHandler } from "./middleware/error";
import { authLimiter, apiLimiter } from "./middleware/rateLimit";
import { authRouter } from "./routes/auth";
import { citiesRouter } from "./routes/cities";
import { assignmentsRouter } from "./routes/assignments";
import { driverRouter } from "./routes/driver";
import { trackingRouter } from "./routes/tracking";
import { leadsRouter } from "./routes/leads";
import { qcRouter } from "./routes/qc";
import { reportsRouter } from "./routes/reports";
import { notificationsRouter } from "./routes/notifications";
import { usersRouter } from "./routes/users";
import { dashboardRouter } from "./routes/dashboard";
import { registerTrackingSocket } from "./socket/tracking.socket";

const app = express();
const httpServer = createServer(app);

// ── CORS origins ────────────────────────────────────────────────────────────
// FRONTEND_URL supports comma-separated values for multiple origins:
// e.g. "https://app.fieldtrack.sa,https://www.fieldtrack.sa"
const allowedOrigins: string[] | true =
  env.NODE_ENV === "development"
    ? true
    : env.FRONTEND_URL.split(",").map((o) => o.trim()).filter(Boolean);

function corsOriginFn(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (allowedOrigins === true) return callback(null, true);
  if (!origin) return callback(null, true); // same-origin / mobile app / curl
  if (allowedOrigins.includes(origin)) return callback(null, true);
  callback(new Error(`CORS: origin ${origin} not allowed`));
}

// ── Socket.io ───────────────────────────────────────────────────────────────
const io = new SocketServer(httpServer, {
  cors: { origin: allowedOrigins === true ? true : allowedOrigins, credentials: true },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 1e6,
  pingInterval: 25000,
  pingTimeout: 60000,
});
registerTrackingSocket(io);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: corsOriginFn, credentials: true }));
app.use(compression() as express.RequestHandler);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
// ── Rate limiting ────────────────────────────────────────────────────────────
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1", apiLimiter);

// ── Root ───────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    service: "FieldTrack KSA API",
    version: "1.0.0",
    status: "running",
    health: "/health",
    docs: "/api/v1",
  });
});

// ── Health ──────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    // Verify DB is reachable — load balancers and uptime monitors call this
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    res.json({ ok: true, db: "connected", env: env.NODE_ENV, ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ok: false, db: "unreachable", error: String(err), ts: new Date().toISOString() });
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRouter);
app.use("/api/v1", citiesRouter);
app.use("/api/v1", assignmentsRouter);
app.use("/api/v1", driverRouter);
app.use("/api/v1/tracking", trackingRouter);
app.use("/api/v1/leads", leadsRouter);
app.use("/api/v1/qc", qcRouter);
app.use("/api/v1", reportsRouter);
app.use("/api/v1", notificationsRouter);
app.use("/api/v1", usersRouter);
app.use("/api/v1", dashboardRouter);

// ── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(env.PORT, "0.0.0.0", () => {
  console.log(`🚀 FieldTrack API  →  http://0.0.0.0:${env.PORT}`);
  console.log(`   Health          →  http://localhost:${env.PORT}/health`);
  console.log(`   Socket.io       →  ws://localhost:${env.PORT}/tracking`);
});

export { app, httpServer };
