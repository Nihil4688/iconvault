// Response headers and cross-origin rules applied to every request.
import type { CorsOptions } from "cors";
import type { NextFunction, Request, Response } from "express";

// Headers that cost nothing and close common holes: no content sniffing, no framing, no referrer leaks, and nothing from /api is cached (it is private to the signed-in user). Downloads set their own stricter headers on top.
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  next();
}

// CORS_ORIGINS is a comma-separated list of exact origins (for example https://app.example.com). When it is not set every origin is allowed, which is convenient in development; set it in production. Requests without an Origin header (the command line, scripts, same-origin) are never blocked by CORS.
export function corsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const allowed = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (allowed.length === 0) return {};
  return {
    origin(origin, callback) {
      callback(null, origin === undefined || allowed.includes(origin.replace(/\/+$/, "")));
    },
  };
}
