// Restricts a route to admins. Must run after requireUser, which loads the user and computes `req.isAdmin` from ADMIN_EMAILS.
import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new UnauthorizedError();
  }
  if (!req.isAdmin) {
    throw new ForbiddenError("Administrator privileges required.");
  }
  next();
}
