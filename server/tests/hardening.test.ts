// Tests for the hardening layer: response headers, CORS rules, and the rate limiter (windows, keys, headers, the sign-in and general limits). No database needed.
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { corsOptions } from "../src/middleware/security.js";
import { byCredential, limiter, limitsFromEnv, DEFAULT_LIMITS } from "../src/middleware/rateLimit.js";

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
  delete process.env.CORS_ORIGINS;
});

async function start(options: Parameters<typeof createApp>[0] = { rateLimit: false }) {
  server = createApp(options).listen(0);
  await new Promise((resolve) => server?.once("listening", resolve));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
}

describe("response headers", () => {
  it("adds the protective headers everywhere and hides the framework", async () => {
    const base = await start();
    for (const path of ["/", "/api/nothing"]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff", path);
      assert.equal(res.headers.get("x-frame-options"), "DENY", path);
      assert.equal(res.headers.get("referrer-policy"), "no-referrer", path);
      assert.equal(res.headers.get("x-powered-by"), null, path);
      assert.match(res.headers.get("permissions-policy") ?? "", /camera=\(\)/);
    }
  });

  it("stops API answers from being cached, but not the health page", async () => {
    const base = await start();
    assert.equal((await fetch(`${base}/api/nothing`)).headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${base}/`)).headers.get("cache-control"), null);
  });
});

describe("CORS", () => {
  it("allows every origin when CORS_ORIGINS is not set", () => {
    assert.deepEqual(corsOptions({}), {});
  });

  it("allows only the listed origins when it is set, and never blocks requests without an Origin", async () => {
    process.env.CORS_ORIGINS = "https://app.example.com/, https://other.example.com";
    const base = await start();
    const allowed = await fetch(`${base}/api/nothing`, { headers: { Origin: "https://app.example.com" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.com");
    const denied = await fetch(`${base}/api/nothing`, { headers: { Origin: "https://evil.example.net" } });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    const noOrigin = await fetch(`${base}/api/nothing`);
    assert.equal(noOrigin.status, 404);
    const preflight = await fetch(`${base}/api/projects`, { method: "OPTIONS", headers: { Origin: "https://evil.example.net", "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
  });
});

describe("the limiter", () => {
  const fakeReq = (headers: Record<string, string> = {}, ip = "1.1.1.1") => ({ ip, header: (name: string) => headers[name.toLowerCase()] }) as never;
  const fakeRes = () => {
    const out: { status: number; body?: unknown; headers: Record<string, string> } = { status: 200, headers: {} };
    const res = {
      setHeader: (k: string, v: string) => void (out.headers[k] = v),
      status(code: number) {
        out.status = code;
        return res;
      },
      json(body: unknown) {
        out.body = body;
        return res;
      },
    };
    return { res: res as never, out };
  };
  const hit = (mw: ReturnType<typeof limiter>, req = fakeReq()) => {
    const { res, out } = fakeRes();
    let passed = false;
    mw(req, res, () => void (passed = true));
    return { passed, out };
  };

  it("lets requests through up to the limit, then answers 429 with Retry-After", () => {
    const mw = limiter({ windowMs: 60_000, max: 2 }, (r) => r.ip ?? "", "things");
    assert.equal(hit(mw).passed, true);
    const second = hit(mw);
    assert.equal(second.passed, true);
    assert.equal(second.out.headers["RateLimit-Remaining"], "0");
    const third = hit(mw);
    assert.equal(third.passed, false);
    assert.equal(third.out.status, 429);
    assert.match(String((third.out.body as { error: string }).error), /Too many things\. Try again in \d+ seconds/);
    assert.ok(Number(third.out.headers["Retry-After"]) >= 1);
  });

  it("counts each address separately and starts over after the window", async () => {
    const mw = limiter({ windowMs: 60, max: 1 }, (r) => r.ip ?? "", "things");
    assert.equal(hit(mw, fakeReq({}, "1.1.1.1")).passed, true);
    assert.equal(hit(mw, fakeReq({}, "1.1.1.1")).passed, false);
    assert.equal(hit(mw, fakeReq({}, "2.2.2.2")).passed, true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(hit(mw, fakeReq({}, "1.1.1.1")).passed, true);
  });

  it("keys heavy operations by credential, not by address, and keeps no raw credential", () => {
    const a = byCredential(fakeReq({ authorization: "Bearer aaa" }, "9.9.9.9"));
    const b = byCredential(fakeReq({ authorization: "Bearer bbb" }, "9.9.9.9"));
    assert.notEqual(a, b);
    assert.equal(a.includes("aaa"), false);
    assert.equal(byCredential(fakeReq({}, "9.9.9.9")), "a:9.9.9.9");
    const mw = limiter({ windowMs: 60_000, max: 1 }, byCredential, "builds");
    assert.equal(hit(mw, fakeReq({ authorization: "Bearer aaa" })).passed, true);
    assert.equal(hit(mw, fakeReq({ authorization: "Bearer aaa" })).passed, false);
    assert.equal(hit(mw, fakeReq({ authorization: "Bearer bbb" })).passed, true);
  });

  it("reads its setting from the environment", () => {
    assert.equal(limitsFromEnv({ RATE_LIMIT_DISABLED: "1" }), false);
    assert.equal(limitsFromEnv({}), DEFAULT_LIMITS);
  });
});

describe("limits on the real app", () => {
  const tiny = { auth: { windowMs: 60_000, max: 3 }, api: { windowMs: 60_000, max: 6 }, heavy: { windowMs: 60_000, max: 2 } };

  it("limits sign-in attempts and leaves /api/auth/me out of that count", async () => {
    const base = await start({ rateLimit: tiny });
    const attempt = () => fetch(`${base}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.deepEqual([(await attempt()).status, (await attempt()).status, (await attempt()).status], [400, 400, 400]);
    const blocked = await attempt();
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("retry-after"));
    assert.match(((await blocked.json()) as { error: string }).error, /sign-in attempts/);
    // Microsoft sign-in shares the same address-based counter space but is its own counter; /me is untouched by the auth limiter.
    assert.notEqual((await fetch(`${base}/api/auth/me`)).status, 429);
  });

  it("limits the API overall per address, but not the health page", async () => {
    const base = await start({ rateLimit: tiny });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) statuses.push((await fetch(`${base}/api/nothing`)).status);
    assert.deepEqual(statuses, [404, 404, 404, 404, 404, 404, 429, 429]);
    assert.equal((await fetch(`${base}/`)).status, 200);
  });

  it("is off when asked to be", async () => {
    const base = await start({ rateLimit: false });
    for (let i = 0; i < 30; i += 1) assert.equal((await fetch(`${base}/api/nothing`)).status, 404);
  });
});
