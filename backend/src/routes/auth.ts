import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { users } from "../db/schema";
import { eq, or } from "drizzle-orm";
import { verifyPassword, signToken } from "../services/auth.service";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/error";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export const authRouter = Router();

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/v1/auth/login
authRouter.post("/login", async (req, res, next) => {
  try {
    const { login, password } = loginSchema.parse(req.body);

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, login), eq(users.phone, login)))
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new AppError(401, "Invalid credentials");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new AppError(401, "Invalid credentials");

    if (!user.isActive) throw new AppError(403, "Account is disabled");

    const expiresIn = user.role === "driver" ? "12h" : "24h";
    const token = signToken(
      { sub: user.id, role: user.role, cityId: user.cityId ?? null },
      expiresIn,
    );

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        cityId: user.cityId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true, message: "Logged out" });
});

// POST /api/v1/auth/refresh
// Accepts an expired token (up to 7 days old) and issues a new one.
authRouter.post("/refresh", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "No token provided");
    const token = authHeader.slice(7);

    let payload: { sub: string; role: string; cityId: string | null; iat?: number };
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true }) as typeof payload;
    } catch {
      throw new AppError(401, "Invalid token");
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (payload.iat && payload.iat * 1000 < sevenDaysAgo) {
      throw new AppError(401, "Token too old to refresh. Please log in again.");
    }

    const [user] = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || !user.isActive) throw new AppError(401, "Account not found or disabled");

    const expiresIn = payload.role === "driver" ? "12h" : "24h";
    const newToken = signToken({ sub: payload.sub, role: payload.role, cityId: payload.cityId }, expiresIn);
    res.json({ token: newToken });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        cityId: users.cityId,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);

    if (!user) throw new AppError(404, "User not found");
    res.json(user);
  } catch (err) {
    next(err);
  }
});
