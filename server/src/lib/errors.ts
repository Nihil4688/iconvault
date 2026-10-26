// Shared HTTP error types and the Express error handler. Routes can throw (Express 5 forwards rejected async handlers here) and every response keeps the existing `{ error: string }` shape.
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request.", details?: unknown) {
    super(400, message, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict.") {
    super(409, message);
    this.name = "ConflictError";
  }
}

type ErrorBody = { error: string; details?: unknown };

// Maps any thrown value to an HTTP status and a safe JSON body. Unknown errors never leak their message.
export function toHttpError(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    const first = issues[0];
    const message = first
      ? `Invalid input${first.path ? ` (${first.path})` : ""}: ${first.message}`
      : "Invalid input.";
    return { status: 400, body: { error: message, details: issues } };
  }

  if (err instanceof AppError) {
    const body: ErrorBody = { error: err.message };
    if (err.details !== undefined) body.details = err.details;
    return { status: err.status, body };
  }

  if (typeof err === "object" && err !== null) {
    const e = err as { name?: unknown; code?: unknown; type?: unknown; status?: unknown };
    // A malformed ObjectId in a URL or body.
    if (e.name === "CastError") {
      return { status: 400, body: { error: "Invalid id." } };
    }
    // Mongoose schema validation failure.
    if (e.name === "ValidationError") {
      return { status: 400, body: { error: "Invalid input." } };
    }
    // Unique index violation.
    if (e.code === 11000) {
      return { status: 409, body: { error: "That already exists." } };
    }
    // Upload problems reported by multer.
    if (e.name === "MulterError") {
      const code = e.code;
      if (code === "LIMIT_FILE_SIZE") return { status: 413, body: { error: "A file is larger than the 25 MB upload limit." } };
      if (code === "LIMIT_FILE_COUNT") return { status: 413, body: { error: "Too many files in one upload (200 at most)." } };
      return { status: 400, body: { error: "The upload was not understood." } };
    }
    // Body parser problems.
    if (e.type === "entity.parse.failed") {
      return { status: 400, body: { error: "Request body is not valid JSON." } };
    }
    if (e.type === "entity.too.large") {
      return { status: 413, body: { error: "Request body is too large." } };
    }
  }

  return { status: 500, body: { error: "Internal server error." } };
}

// Express error handler. Register it after all routes.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const { status, body } = toHttpError(err);
  if (status >= 500) {
    console.error("[server] Unhandled error:", err);
  }
  res.status(status).json(body);
}
