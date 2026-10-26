// Answers 503 with a clear message when the database is not connected, instead of letting queries hang until the buffer timeout.
import type { NextFunction, Request, Response } from "express";
import { ensureConnected } from "../config/db.js";

export async function requireDb(_req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await ensureConnected())) {
    res.status(503).json({
      error: "Database is not connected. Check Atlas Network Access (whitelist your IP) and the MONGODB_URI credentials.",
    });
    return;
  }
  next();
}
