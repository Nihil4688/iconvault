// HTTP tests for API tokens against a throwaway database: creating (shown once), listing without secrets, using a token like a session, what a token may not do (manage tokens, act as admin), revoking, limits, and isolation between users.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { hashToken } from "../../src/lib/apiToken.js";
import ApiToken from "../../src/models/ApiToken.js";
import { hasDatabase, startHarness, type TestUser } from "./harness.js";

describe("API tokens (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let ada: TestUser;
  let bob: TestUser;
  let admin: TestUser;

  before(async () => {
    h = await startHarness();
    ada = await h.makeUser("ada");
    bob = await h.makeUser("bob");
    admin = await h.makeUser("admin", { admin: true });
  });
  after(() => h?.stop());

  const create = async (user: TestUser, name = "CI") => {
    const r = await h.call(user.token, "POST", "/api/tokens", { name, scope: "write" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body as { id: string; token: string; prefix: string; name: string };
  };

  describe("creating and listing", () => {
    it("needs a sign-in", async () => {
      assert.equal((await h.call(null, "GET", "/api/tokens")).status, 401);
      assert.equal((await h.call(null, "POST", "/api/tokens", { name: "x" })).status, 401);
    });

    it("returns the token once and stores only its hash", async () => {
      const t = await create(ada, "  Laptop  ");
      assert.match(t.token, /^isv_/);
      assert.equal(t.name, "Laptop");
      assert.equal(t.prefix, t.token.slice(0, 8));
      const row = await ApiToken.findById(t.id).lean();
      assert.equal(row?.tokenHash, hashToken(t.token));
      assert.equal(JSON.stringify(row).includes(t.token), false);
    });

    it("lists only your own tokens and never shows the secret or hash", async () => {
      await create(bob, "bobs");
      const r = await h.call(ada.token, "GET", "/api/tokens");
      assert.equal(r.status, 200);
      assert.equal(r.body.tokens.every((t: { name: string }) => t.name !== "bobs"), true);
      assert.equal(r.body.maxActive, 10);
      const text = JSON.stringify(r.body);
      assert.doesNotMatch(text, /isv_[A-Za-z0-9_-]{43}/);
      assert.doesNotMatch(text, /tokenHash/);
    });

    it("validates the name and rejects extra fields", async () => {
      assert.equal((await h.call(ada.token, "POST", "/api/tokens", {})).status, 400);
      assert.equal((await h.call(ada.token, "POST", "/api/tokens", { name: "   " })).status, 400);
      assert.equal((await h.call(ada.token, "POST", "/api/tokens", { name: "x".repeat(61) })).status, 400);
      assert.equal((await h.call(ada.token, "POST", "/api/tokens", { name: "ok", userId: bob.id })).status, 400);
    });

    it("allows ten active tokens, and a revoked one frees a place", async () => {
      const user = await h.makeUser("many");
      const made = [];
      for (let i = 0; i < 10; i += 1) made.push(await create(user, `t${i}`));
      assert.equal((await h.call(user.token, "POST", "/api/tokens", { name: "eleventh" })).status, 409);
      await h.call(user.token, "DELETE", `/api/tokens/${made[0]?.id}`);
      assert.equal((await h.call(user.token, "POST", "/api/tokens", { name: "again" })).status, 201);
    });
  });

  describe("using a token", () => {
    it("works like the user's own session for projects and shows who you are", async () => {
      const t = await create(ada, "use");
      const me = await h.call(t.token, "GET", "/api/auth/me");
      assert.equal(me.status, 200);
      assert.equal(me.body.user.email, ada.email);
      assert.equal(me.body.user.authMethod, "token");
      const made = await h.call(t.token, "POST", "/api/projects", { name: "From CLI" });
      assert.equal(made.status, 201);
      assert.equal(made.body.owner.id, ada.id);
      assert.equal((await h.call(ada.token, "GET", `/api/projects/${made.body.id}`)).status, 200);
      // Other people's private projects stay hidden.
      assert.equal((await h.call(t.token, "GET", `/api/projects/${(await h.call(bob.token, "POST", "/api/projects", { name: "Bobs" })).body.id}`)).status, 404);
    });

    it("records when it was last used", async () => {
      const t = await create(ada, "stamp");
      assert.equal((await ApiToken.findById(t.id).lean())?.lastUsedAt, null);
      await h.call(t.token, "GET", "/api/projects");
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.ok((await ApiToken.findById(t.id).lean())?.lastUsedAt);
    });

    it("refuses made-up, truncated and empty tokens", async () => {
      const t = await create(ada, "real");
      for (const bad of ["isv_notarealtoken", t.token.slice(0, -2), `${t.token}x`, "isv_"]) {
        const r = await h.call(bad, "GET", "/api/projects");
        assert.equal(r.status, 401, bad);
      }
    });

    it("cannot manage tokens, so a leaked token cannot make more", async () => {
      const t = await create(ada, "limited");
      assert.equal((await h.call(t.token, "POST", "/api/tokens", { name: "more" })).status, 403);
      assert.equal((await h.call(t.token, "GET", "/api/tokens")).status, 403);
      assert.equal((await h.call(t.token, "DELETE", `/api/tokens/${t.id}`)).status, 403);
    });

    it("never carries admin rights, even for an admin's token", async () => {
      const t = await create(admin, "admin cli");
      assert.equal((await h.call(admin.token, "GET", "/api/admin/users")).status, 200);
      const viaToken = await h.call(t.token, "GET", "/api/admin/users");
      assert.equal(viaToken.status, 403);
      assert.equal((await h.call(t.token, "GET", "/api/auth/me")).body.user.role, "user");
      // And it cannot see another user's private project.
      const priv = (await h.call(bob.token, "POST", "/api/projects", { name: "Hidden from admin token" })).body;
      assert.equal((await h.call(t.token, "GET", `/api/projects/${priv.id}`)).status, 404);
      assert.equal((await h.call(admin.token, "GET", `/api/projects/${priv.id}`)).status, 200);
    });
  });

  describe("revoking", () => {
    it("stops the token at once and keeps it in the list as revoked", async () => {
      const t = await create(ada, "to revoke");
      assert.equal((await h.call(t.token, "GET", "/api/projects")).status, 200);
      const r = await h.call(ada.token, "DELETE", `/api/tokens/${t.id}`);
      assert.equal(r.status, 200);
      assert.ok(r.body.revokedAt);
      const after = await h.call(t.token, "GET", "/api/projects");
      assert.equal(after.status, 401);
      assert.match(after.body.error, /revoked/);
      const listed = (await h.call(ada.token, "GET", "/api/tokens")).body.tokens.find((x: { id: string }) => x.id === t.id);
      assert.ok(listed.revokedAt);
      // Revoking twice is harmless.
      assert.equal((await h.call(ada.token, "DELETE", `/api/tokens/${t.id}`)).status, 200);
    });

    it("cannot touch someone else's token, or an unknown one", async () => {
      const t = await create(bob, "bobs again");
      assert.equal((await h.call(ada.token, "DELETE", `/api/tokens/${t.id}`)).status, 404);
      assert.equal((await h.call(t.token, "GET", "/api/projects")).status, 200);
      assert.equal((await h.call(ada.token, "DELETE", "/api/tokens/nope")).status, 400);
    });
  });
});
