// HTTP tests for the admin routes against a throwaway database: who may use them, the user list with counts, deleting a user (with their projects, or handing the projects over), and moving one project to another owner.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import ApiToken from "../../src/models/ApiToken.js";
import Icon from "../../src/models/Icon.js";
import IconVersion from "../../src/models/IconVersion.js";
import Project from "../../src/models/Project.js";
import User from "../../src/models/User.js";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

describe("admin routes (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let admin: TestUser;
  let ada: TestUser;
  let bob: TestUser;

  before(async () => {
    h = await startHarness();
    admin = await h.makeUser("admin", { admin: true });
    ada = await h.makeUser("ada");
    bob = await h.makeUser("bob");
  });
  after(() => h?.stop());

  const makeProject = async (token: string, name: string) => (await h.call(token, "POST", "/api/projects", { name })).body;
  const addIcon = (projectId: string, slug: string) => Icon.create({ projectId: new mongoose.Types.ObjectId(projectId), name: slug, slug, svg: SVG(), byteSize: 60 });

  describe("who may use them", () => {
    it("needs a signed-in admin", async () => {
      assert.equal((await h.call(null, "GET", "/api/admin/users")).status, 401);
      const asUser = await h.call(ada.token, "GET", "/api/admin/users");
      assert.equal(asUser.status, 403);
      assert.equal(asUser.body.error, "Administrator privileges required.");
      assert.equal((await h.call(ada.token, "DELETE", `/api/admin/users/${bob.id}`)).status, 403);
      assert.equal((await h.call(ada.token, "POST", `/api/admin/projects/${bob.id}/transfer`, { userId: ada.id })).status, 403);
      assert.equal((await h.call(admin.token, "GET", "/api/admin/users")).status, 200);
    });
  });

  describe("listing users", () => {
    it("shows each user with their projects, active icons, tokens and admin flag", async () => {
      const p = await makeProject(ada.token, "Ada project");
      await addIcon(p.id, "one");
      await addIcon(p.id, "two");
      await Icon.create({ projectId: new mongoose.Types.ObjectId(p.id), name: "gone", slug: "gone", svg: SVG(), byteSize: 60, deletedAt: new Date() });
      await ApiToken.create({ userId: ada.id, name: "ci", tokenHash: "h1", prefix: "isv_aaaa" });
      await ApiToken.create({ userId: ada.id, name: "old", tokenHash: "h2", prefix: "isv_bbbb", revokedAt: new Date() });

      const r = await h.call(admin.token, "GET", "/api/admin/users");
      assert.equal(r.status, 200);
      assert.equal(r.body.total, 3);
      const row = (email: string) => r.body.users.find((u: { email: string }) => u.email === email);
      assert.deepEqual(
        { projects: row(ada.email).projectCount, icons: row(ada.email).iconCount, tokens: row(ada.email).activeTokens, admin: row(ada.email).isAdmin },
        { projects: 1, icons: 2, tokens: 1, admin: false },
      );
      assert.equal(row(admin.email).isAdmin, true);
      assert.equal(row(admin.email).isSelf, true);
      assert.equal(row(bob.email).projectCount, 0);
      assert.equal("passwordHash" in row(bob.email), false);
    });

    it("searches by name or email and pages", async () => {
      const r = await h.call(admin.token, "GET", "/api/admin/users?search=bob");
      assert.deepEqual(r.body.users.map((u: { displayName: string }) => u.displayName), ["bob"]);
      const page = await h.call(admin.token, "GET", "/api/admin/users?limit=2&page=2");
      assert.equal(page.body.users.length, 1);
      assert.equal(page.body.total, 3);
      assert.equal((await h.call(admin.token, "GET", "/api/admin/users?limit=500")).status, 400);
    });

    it("treats search text literally", async () => {
      assert.equal((await h.call(admin.token, "GET", "/api/admin/users?search=.*")).body.total, 0);
    });
  });

  describe("deleting a user", () => {
    it("refuses to delete yourself or an unknown user, and bad input", async () => {
      assert.equal((await h.call(admin.token, "DELETE", `/api/admin/users/${admin.id}`)).status, 400);
      assert.equal((await h.call(admin.token, "DELETE", `/api/admin/users/${new mongoose.Types.ObjectId()}`)).status, 404);
      assert.equal((await h.call(admin.token, "DELETE", "/api/admin/users/nope")).status, 400);
      assert.equal((await h.call(admin.token, "DELETE", `/api/admin/users/${bob.id}`, { transferTo: "nope" })).status, 400);
      assert.equal((await h.call(admin.token, "DELETE", `/api/admin/users/${bob.id}`, { transferTo: bob.id })).status, 400);
      assert.equal((await h.call(admin.token, "DELETE", `/api/admin/users/${bob.id}`, { transferTo: new mongoose.Types.ObjectId() })).status, 404);
      assert.ok(await User.exists({ _id: bob.id }));
    });

    it("deletes a user with their projects, icons, versions and tokens", async () => {
      const victim = await h.makeUser("victim");
      const p = await makeProject(victim.token, "Doomed");
      const icon = await addIcon(p.id, "x");
      await IconVersion.create({ iconId: icon._id, svg: SVG(), byteSize: 60 });
      await ApiToken.create({ userId: victim.id, name: "t", tokenHash: "victim-hash", prefix: "isv_vvvv" });

      const r = await h.call(admin.token, "DELETE", `/api/admin/users/${victim.id}`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body, { deletedProjects: 1, deletedIcons: 1, transferredProjects: 0, revokedTokens: 1 });
      assert.equal(await User.exists({ _id: victim.id }), null);
      assert.equal(await Project.countDocuments({ ownerId: victim.id }), 0);
      assert.equal(await Icon.countDocuments({ projectId: p.id }), 0);
      assert.equal(await IconVersion.countDocuments({ iconId: icon._id }), 0);
      assert.equal(await ApiToken.countDocuments({ userId: victim.id }), 0);
      // Their old session no longer works.
      assert.equal((await h.call(victim.token, "GET", "/api/projects")).status, 401);
    });

    it("hands the projects to another user instead when asked", async () => {
      const leaver = await h.makeUser("leaver");
      const p = await makeProject(leaver.token, "Kept");
      await addIcon(p.id, "keep");

      const r = await h.call(admin.token, "DELETE", `/api/admin/users/${leaver.id}`, { transferTo: bob.id });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.transferredProjects, 1);
      assert.equal(r.body.deletedProjects, 0);
      assert.equal((await Project.findById(p.id))?.ownerId.toString(), bob.id);
      assert.equal(await Icon.countDocuments({ projectId: p.id }), 1);
      const asBob = await h.call(bob.token, "GET", `/api/projects/${p.id}`);
      assert.equal(asBob.body.access.canEdit, true);
    });
  });

  describe("moving one project", () => {
    it("moves it to another owner, who then has full control and the old owner does not", async () => {
      const p = await makeProject(ada.token, "Moving");
      const r = await h.call(admin.token, "POST", `/api/admin/projects/${p.id}/transfer`, { userId: bob.id });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.owner.id, bob.id);
      assert.equal((await h.call(bob.token, "PATCH", `/api/projects/${p.id}`, { name: "Bob's now" })).status, 200);
      assert.equal((await h.call(ada.token, "GET", `/api/projects/${p.id}`)).status, 404);
    });

    it("refuses an unknown user, the same owner, bad ids and extra fields", async () => {
      const p = await makeProject(ada.token, "Stay");
      assert.equal((await h.call(admin.token, "POST", `/api/admin/projects/${p.id}/transfer`, { userId: String(new mongoose.Types.ObjectId()) })).status, 404);
      assert.equal((await h.call(admin.token, "POST", `/api/admin/projects/${p.id}/transfer`, { userId: ada.id })).status, 409);
      assert.equal((await h.call(admin.token, "POST", `/api/admin/projects/${p.id}/transfer`, { userId: "x" })).status, 400);
      assert.equal((await h.call(admin.token, "POST", `/api/admin/projects/${p.id}/transfer`, { userId: bob.id, extra: 1 })).status, 400);
      assert.equal((await h.call(admin.token, "POST", `/api/admin/projects/${new mongoose.Types.ObjectId()}/transfer`, { userId: bob.id })).status, 404);
    });
  });
});
