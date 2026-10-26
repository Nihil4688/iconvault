// Unit tests for the ADMIN_EMAILS allowlist: parsing, per-call evaluation, and the verified-email rule.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getAdminEmails, isAdminUser, roleFor } from "../src/lib/admins.js";

const KEYS = ["ADMIN_EMAILS", "MS_TENANT_ID"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

describe("admin allowlist", () => {
  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    delete process.env.ADMIN_EMAILS;
    delete process.env.MS_TENANT_ID;
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("is empty when ADMIN_EMAILS is unset or blank", () => {
    assert.equal(getAdminEmails().size, 0);
    process.env.ADMIN_EMAILS = " , ,";
    assert.equal(getAdminEmails().size, 0);
    assert.equal(isAdminUser({ email: "a@example.com", emailVerified: true }), false);
  });

  it("parses a comma-separated list, trimming spaces and ignoring case", () => {
    process.env.ADMIN_EMAILS = " Admin@Example.com ,second@example.com,";
    assert.deepEqual([...getAdminEmails()].sort(), ["admin@example.com", "second@example.com"]);
    assert.equal(isAdminUser({ email: "ADMIN@example.COM", emailVerified: true }), true);
    assert.equal(isAdminUser({ email: "second@example.com", emailVerified: true }), true);
  });

  it("does not make anyone else an admin", () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    assert.equal(isAdminUser({ email: "other@example.com", emailVerified: true }), false);
    assert.equal(isAdminUser(null), false);
    assert.equal(isAdminUser(undefined), false);
  });

  it("is evaluated on every call, so changing the setting takes effect immediately", () => {
    const user = { email: "admin@example.com", emailVerified: true };
    assert.equal(isAdminUser(user), false);
    process.env.ADMIN_EMAILS = "admin@example.com";
    assert.equal(isAdminUser(user), true);
    process.env.ADMIN_EMAILS = "someone-else@example.com";
    assert.equal(isAdminUser(user), false);
  });

  it("requires the provider to have verified the email", () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    assert.equal(isAdminUser({ email: "admin@example.com", emailVerified: false }), false);
    assert.equal(isAdminUser({ email: "admin@example.com" }), false);
    assert.equal(isAdminUser({ email: "admin@example.com", emailVerified: null }), false);
  });

  it("trusts an unverified Microsoft email only for a single-tenant app", () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    const ms = { email: "admin@example.com", emailVerified: false, provider: "microsoft" };
    assert.equal(isAdminUser(ms), false);

    for (const shared of ["common", "organizations", "consumers", "COMMON", ""]) {
      process.env.MS_TENANT_ID = shared;
      assert.equal(isAdminUser(ms), false, `tenant "${shared}" must not be trusted`);
    }

    process.env.MS_TENANT_ID = "11111111-2222-3333-4444-555555555555";
    assert.equal(isAdminUser(ms), true);
    // The single-tenant exception is for Microsoft only.
    assert.equal(isAdminUser({ ...ms, provider: "google" }), false);
  });

  it("maps to a role", () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    assert.equal(roleFor({ email: "admin@example.com", emailVerified: true }), "admin");
    assert.equal(roleFor({ email: "x@example.com", emailVerified: true }), "user");
  });
});
