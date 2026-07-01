import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../services/auth.service";
import { AppError } from "./error";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  // Accept token from Authorization header OR ?token= query param (for file downloads)
  const header = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;

  const raw = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;

  if (!raw) {
    return next(new AppError(401, "Missing or invalid authorization header"));
  }

  try {
    req.user = verifyToken(raw);
    next();
  } catch {
    next(new AppError(401, "Token is invalid or expired"));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError(401, "Unauthorized"));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, `Requires one of: ${roles.join(", ")}`));
    }
    next();
  };
}
