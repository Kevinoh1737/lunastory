import type { Request, Response, NextFunction } from "express";
import { bearerFromHeader, verifyToken } from "../lib/auth";

/**
 * Allowlist of `/api/...` paths that DO NOT require the soft-lock token:
 *   - healthz: probed by Cloud Run, must stay public
 *   - auth/unlock + auth/check: chicken-and-egg with the lock itself
 *   - ecount/sync*: protected by its own X-Sync-Secret header (Cloud Scheduler)
 */
function isPublicPath(path: string): boolean {
  if (path === "/healthz") return true;
  if (path.startsWith("/auth/")) return true;
  if (path.startsWith("/ecount/sync")) return true;
  return false;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // req.path is mount-relative (i.e. starts after '/api')
  if (isPublicPath(req.path)) {
    next();
    return;
  }
  const token = bearerFromHeader(req.get("authorization"));
  if (!verifyToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
