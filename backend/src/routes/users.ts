import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
// CHANGED - include streets so Driver deactivation resolves both assignment and map status atomically.
import { users, leads, driverAssignments, streets } from "../db/schema";
// CHANGED - include set operators required for incomplete-street resolution.
import { eq, and, count, sql, desc, ilike, or, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { hashPassword } from "../services/auth.service";
import { logActivity } from "../services/activity.service";
import { AppError } from "../middleware/error";

export const usersRouter = Router();

const createUserSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["super_admin", "city_manager", "driver", "client"]),
  cityId: z.string().uuid().optional(),
  iqamaNumber: z.string().optional(),
  carPlateNumber: z.string().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(["super_admin", "city_manager", "driver", "client"]).optional(),
  cityId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  iqamaNumber: z.string().optional(),
  carPlateNumber: z.string().optional(),
});

// NEW - completed and skipped are terminal; only these assignment states block deactivation.
const incompleteAssignmentStatuses = ["assigned", "in_progress", "on_hold"] as const;

// GET /api/v1/users
usersRouter.get("/users", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    const conditions = [];

    if (q.role) conditions.push(eq(users.role, q.role as typeof users.role._.data));
    if (q.city_id) conditions.push(eq(users.cityId, q.city_id));
    if (q.is_active !== undefined) conditions.push(eq(users.isActive, q.is_active === "true"));
    if (q.search) {
      conditions.push(
        or(
          ilike(users.fullName, `%${q.search}%`),
          ilike(users.email, `%${q.search}%`),
          ilike(users.phone, `%${q.search}%`),
        )!,
      );
    }

    // City managers can only see users in their city
    if (req.user!.role === "city_manager" && req.user!.cityId) {
      conditions.push(eq(users.cityId, req.user!.cityId));
    }

    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        cityId: users.cityId,
        iqamaNumber: users.iqamaNumber,
        carPlateNumber: users.carPlateNumber,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(Number(q.limit ?? 100))
      .offset(Number(q.offset ?? 0));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/:id
usersRouter.get("/users/:id", requireAuth, async (req, res, next) => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        cityId: users.cityId,
        iqamaNumber: users.iqamaNumber,
        carPlateNumber: users.carPlateNumber,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.params.id))
      .limit(1);

    if (!user) throw new AppError(404, "User not found");

    const [leadCount] = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.driverId, req.params.id));

    const [assignmentCount] = await db
      .select({ count: count() })
      .from(driverAssignments)
      .where(eq(driverAssignments.driverId, req.params.id));

    res.json({
      ...user,
      totalLeads: leadCount.count,
      totalAssignments: assignmentCount.count,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users
usersRouter.post("/users", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    if (data.email) {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
      if (existing) throw new AppError(409, "Email already in use");
    }

    if (data.phone) {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, data.phone)).limit(1);
      if (existing) throw new AppError(409, "Phone number already in use");
    }

    const passwordHash = await hashPassword(data.password);

    const [user] = await db
      .insert(users)
      .values({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        passwordHash,
        role: data.role,
        cityId: data.cityId,
        iqamaNumber: data.iqamaNumber,
        carPlateNumber: data.carPlateNumber,
      })
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        cityId: users.cityId,
        iqamaNumber: users.iqamaNumber,
        carPlateNumber: users.carPlateNumber,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });

    await logActivity({
      userId: req.user!.sub,
      cityId: req.user!.cityId,
      action: "user.created",
      entityType: "user",
      entityId: user.id,
      metadata: { role: data.role, fullName: data.fullName },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/users/:id
usersRouter.patch("/users/:id", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const data = updateUserSchema.parse(req.body);

    // NEW - prevent the generic update endpoint from bypassing Driver assignment resolution.
    if (data.isActive === false) {
      const [targetUser] = await db
        .select({ role: users.role, cityId: users.cityId })
        .from(users)
        .where(eq(users.id, req.params.id))
        .limit(1);
      if (!targetUser) throw new AppError(404, "User not found");
      if (targetUser.role === "driver") {
        const incompleteRows = await db
          .select({ streetId: driverAssignments.streetId })
          .from(driverAssignments)
          .where(and(
            eq(driverAssignments.driverId, req.params.id),
            inArray(driverAssignments.status, [...incompleteAssignmentStatuses]),
          ));
        const incompleteStreetCount = new Set(incompleteRows.map(row => row.streetId).filter(Boolean)).size;
        if (incompleteStreetCount > 0) {
          return res.status(409).json({
            error: "Choose how to resolve incomplete streets before deactivation",
            code: "DRIVER_ASSIGNMENT_ACTION_REQUIRED",
            incompleteStreetCount,
            cityId: targetUser.cityId,
          });
        }
      }
    }

    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, req.params.id))
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        cityId: users.cityId,
        iqamaNumber: users.iqamaNumber,
        carPlateNumber: users.carPlateNumber,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });

    if (!user) throw new AppError(404, "User not found");

    await logActivity({
      userId: req.user!.sub,
      cityId: req.user!.cityId,
      action: "user.updated",
      entityType: "user",
      entityId: user.id,
      metadata: data,
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// NEW - resolve incomplete streets and deactivate the Driver in one transaction.
usersRouter.post("/users/:id/deactivate", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    const { action, newDriverId } = z.object({
      action: z.enum(["unassign_all", "reassign", "keep_on_hold"]).optional(),
      newDriverId: z.string().uuid().optional(),
    }).parse(req.body ?? {});

    const result = await db.transaction(async tx => {
      const [targetDriver] = await tx
        .select({ id: users.id, role: users.role, cityId: users.cityId, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, req.params.id))
        .limit(1);
      if (!targetDriver || targetDriver.role !== "driver") throw new AppError(404, "Driver not found");

      const incompleteRows = await tx
        .select({ id: driverAssignments.id, streetId: driverAssignments.streetId })
        .from(driverAssignments)
        .where(and(
          eq(driverAssignments.driverId, targetDriver.id),
          inArray(driverAssignments.status, [...incompleteAssignmentStatuses]),
        ));
      const streetIds = [...new Set(incompleteRows.map(row => row.streetId).filter((id): id is string => Boolean(id)))];

      if (streetIds.length > 0 && !action) {
        return { requiresAction: true as const, incompleteStreetCount: streetIds.length, cityId: targetDriver.cityId };
      }

      if (action === "reassign") {
        if (!newDriverId) throw new AppError(400, "newDriverId is required for reassignment");
        const [replacement] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.id, newDriverId),
            eq(users.role, "driver"),
            eq(users.isActive, true),
            targetDriver.cityId ? eq(users.cityId, targetDriver.cityId) : sql`${users.cityId} is null`,
          ))
          .limit(1);
        if (!replacement || replacement.id === targetDriver.id) {
          throw new AppError(400, "Replacement Driver must be active and in the same city");
        }
      }

      if (incompleteRows.length > 0 && action) {
        const assignmentIds = incompleteRows.map(row => row.id);
        if (action === "unassign_all") {
          await tx.update(driverAssignments).set({
            driverId: null,
            status: "not_assigned",
            startedAt: null,
            completedAt: null,
            skippedReason: null,
          }).where(inArray(driverAssignments.id, assignmentIds));
          await tx.update(streets).set({ status: "not_assigned" }).where(inArray(streets.id, streetIds));
        } else if (action === "reassign") {
          await tx.update(driverAssignments).set({
            driverId: newDriverId!,
            status: "assigned",
            assignedBy: req.user!.sub,
            assignedDate: new Date().toISOString().slice(0, 10),
            startedAt: null,
            completedAt: null,
            skippedReason: null,
          }).where(inArray(driverAssignments.id, assignmentIds));
          await tx.update(streets).set({ status: "assigned" }).where(inArray(streets.id, streetIds));
        } else {
          await tx.update(driverAssignments).set({ status: "on_hold" }).where(inArray(driverAssignments.id, assignmentIds));
          await tx.update(streets).set({ status: "on_hold" }).where(inArray(streets.id, streetIds));
        }
      }

      const [driver] = await tx
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, targetDriver.id))
        .returning({ id: users.id, fullName: users.fullName, cityId: users.cityId, isActive: users.isActive });

      return { requiresAction: false as const, driver, affectedStreetCount: streetIds.length, action: action ?? null };
    });

    if (result.requiresAction) {
      return res.status(409).json({
        error: "Choose how to resolve incomplete streets before deactivation",
        code: "DRIVER_ASSIGNMENT_ACTION_REQUIRED",
        incompleteStreetCount: result.incompleteStreetCount,
        cityId: result.cityId,
      });
    }

    await logActivity({
      userId: req.user!.sub,
      cityId: result.driver.cityId,
      action: "driver.deactivated",
      entityType: "user",
      entityId: result.driver.id,
      metadata: { assignmentAction: result.action, affectedStreetCount: result.affectedStreetCount },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/users/:id (permanent delete)
usersRouter.delete("/users/:id", requireAuth, requireRole("super_admin", "city_manager"), async (req, res, next) => {
  try {
    if (req.params.id === req.user!.sub) {
      throw new AppError(400, "Cannot delete your own account");
    }

    const [user] = await db
      .delete(users)
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id, fullName: users.fullName });

    if (!user) throw new AppError(404, "User not found");

    await logActivity({
      userId: req.user!.sub,
      cityId: req.user!.cityId,
      action: "user.deleted",
      entityType: "user",
      entityId: user.id,
    });

    res.json({ ok: true, deleted: user.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users/:id/reset-password
usersRouter.post("/users/:id/reset-password", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const { password } = z.object({ password: z.string().min(6) }).parse(req.body);
    const passwordHash = await hashPassword(password);

    const [user] = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id });

    if (!user) throw new AppError(404, "User not found");

    await logActivity({
      userId: req.user!.sub,
      cityId: req.user!.cityId,
      action: "user.password_reset",
      entityType: "user",
      entityId: user.id,
    });

    res.json({ ok: true, userId: user.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/change-password (for the logged-in user)
usersRouter.post("/auth/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) })
      .parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.sub)).limit(1);
    if (!user || !user.passwordHash) throw new AppError(400, "Cannot change password");

    const { verifyPassword } = await import("../services/auth.service");
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw new AppError(401, "Current password is incorrect");

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, req.user!.sub));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
