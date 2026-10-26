// A small in-memory rate limiter (fixed windows, no dependencies). It protects sign-in from guessing, and the expensive operations (font builds, imports, exports, uploads) from being hammered. Counters live in this process only, which is right for a single server; behind several servers use a shared store instead.
import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export type LimitRule = { windowMs: number; max: number };
export type RateLimitConfig = { auth: LimitRule; api: LimitRule; heavy: LimitRule };

export const DEFAULT_LIMITS: RateLimitConfig = {
  // Sign-in attempts per address.
  auth: { windowMs: 15 * 60_000, max: 30 },
  // Every API request per address: generous, only stops runaway loops.
  api: { windowMs: 60_000, max: 1200 },
  // Expensive operations per credential.
  heavy: { windowMs: 60_000, max: 40 },
};

type KeyFn = (req: Request) => string;

export function limiter(rule: LimitRule, key: KeyFn, what: string): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.max(1000, rule.windowMs));
  // Never keep the process alive just for the cleanup timer.
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + rule.windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    res.setHeader("RateLimit-Limit", String(rule.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, rule.max - entry.count)));
    if (entry.count > rule.max) {
      const retry = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retry));
      res.status(429).json({ error: `Too many ${what}. Try again in ${retry < 90 ? `${retry} seconds` : `${Math.ceil(retry / 60)} minutes`}.` });
      return;
    }
    next();
  };
}

export const byAddress: KeyFn = (req) => req.ip ?? "unknown";

// One counter per credential (session or API token), so one user cannot use up another's allowance. Falls back to the address when there is no credential. Only a hash is kept in memory.
export const byCredential: KeyFn = (req) => {
  const header = req.header("authorization");
  return header ? `c:${createHash("sha256").update(header).digest("hex").slice(0, 32)}` : `a:${req.ip ?? "unknown"}`;
};

type Limiters = { auth: RequestHandler; api: RequestHandler; heavy: RequestHandler };
const passThrough: RequestHandler = (_req, _res, next) => next();
let current: Limiters = { auth: passThrough, api: passThrough, heavy: passThrough };

// Called once by createApp. `false` turns limiting off (used by the test suites that make thousands of requests).
export function configureRateLimits(config: RateLimitConfig | false): Limiters {
  current = config
    ? { auth: limiter(config.auth, byAddress, "sign-in attempts"), api: limiter(config.api, byAddress, "requests"), heavy: limiter(config.heavy, byCredential, "builds, imports and exports") }
    : { auth: passThrough, api: passThrough, heavy: passThrough };
  return current;
}

// Route-level guards that always use the configuration of the app that was created last.
export const authLimit: RequestHandler = (req, res, next) => current.auth(req, res, next);
export const apiLimit: RequestHandler = (req, res, next) => current.api(req, res, next);
export const heavyLimit: RequestHandler = (req, res, next) => current.heavy(req, res, next);

// Reads the limits from the environment: RATE_LIMIT_DISABLED=1 turns everything off.
export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): RateLimitConfig | false {
  if (env.RATE_LIMIT_DISABLED === "1") return false;
  return DEFAULT_LIMITS;
}
