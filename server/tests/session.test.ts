// Unit tests for the session token helpers (HS256 JWT) that every protected route depends on.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { signSession, verifySession, type SessionClaims } from "../src/lib/session.js";

const claims: SessionClaims = {
  sub: "64b7f0c2a1b2c3d4e5f60718",
  email: "user@example.com",
  provider: "google",
  providerId: "google-123",
};

describe("session tokens", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "unit-test-secret-0123456789";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  });

  it("round-trips the claims", async () => {
    const token = await signSession(claims);
    assert.deepEqual(await verifySession(token), claims);
  });

  it("accepts every provider the User model allows", async () => {
    for (const provider of ["google", "microsoft", "password", "system"] as const) {
      const token = await signSession({ ...claims, provider });
      assert.equal((await verifySession(token)).provider, provider);
    }
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(claims);
    process.env.SESSION_SECRET = "a-different-secret-0123456789";
    await assert.rejects(verifySession(token));
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(claims);
    const [header, payload, signature] = token.split(".");
    const tampered = `${header}.${payload}x.${signature}`;
    await assert.rejects(verifySession(tampered));
  });

  it("refuses to sign when the secret is missing or too short", async () => {
    process.env.SESSION_SECRET = "short";
    await assert.rejects(signSession(claims), /SESSION_SECRET/);
    delete process.env.SESSION_SECRET;
    await assert.rejects(signSession(claims), /SESSION_SECRET/);
  });
});
