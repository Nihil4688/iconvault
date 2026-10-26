// HTTP tests for the admin's project list (Manage Projects): an admin sees every project, including other people's private and archived ones, and can search by the owner's name or email; other users cannot.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { hasDatabase, startHarness, type TestUser } from "./harness.js";

describe("manage projects (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
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

  const project = async (token: string, name: string, over: Record<string, unknown> = {}) => (await h.call(token, "POST", "/api/projects", { name, ...over })).body;
  const names = (body: { projects: { name: string }[] }) => body.projects.map((p) => p.name).sort();

  it("lets an admin list everyone's projects, private and archived included, but not other users", async () => {
    await project(ada.token, "Ada private");
    const archived = await project(bob.token, "Bob archived");
    await h.call(bob.token, "PATCH", `/api/projects/${archived.id}`, { isArchived: true });
    const all = await h.call(admin.token, "GET", "/api/projects?status=all&scope=all&limit=100");
    assert.equal(all.status, 200);
    assert.ok(names(all.body).includes("Ada private") && names(all.body).includes("Bob archived"));
    const adaView = await h.call(ada.token, "GET", "/api/projects?status=all&scope=all&limit=100");
    assert.equal(names(adaView.body).includes("Bob archived"), false);
  });

  it("finds projects by the owner's name or email for an admin only", async () => {
    await project(ada.token, "Zebra one");
    await project(bob.token, "Zebra two");
    const byOwner = await h.call(admin.token, "GET", `/api/projects?status=all&search=${encodeURIComponent(ada.email)}&limit=100`);
    const found = names(byOwner.body);
    assert.ok(found.includes("Zebra one") && found.includes("Ada private"));
    assert.equal(found.includes("Zebra two"), false);
    // A normal user searching an owner's email does not find other people's private projects that way.
    const normal = await h.call(bob.token, "GET", `/api/projects?status=all&search=${encodeURIComponent(ada.email)}&limit=100`);
    assert.equal(names(normal.body).includes("Zebra one"), false);
  });

  it("filters the user list by sign-in provider", async () => {
    const google = await h.call(admin.token, "GET", "/api/admin/users?provider=google&limit=100");
    assert.equal(google.status, 200);
    assert.ok(google.body.users.length >= 3 && google.body.users.every((u: any) => u.provider === "google"));
    const microsoft = await h.call(admin.token, "GET", "/api/admin/users?provider=microsoft&limit=100");
    assert.ok(microsoft.body.users.every((u: any) => u.provider === "microsoft"));
    assert.equal((await h.call(admin.token, "GET", "/api/admin/users?provider=nope")).status, 400);
    const all = await h.call(admin.token, "GET", "/api/admin/users?limit=100");
    assert.ok(all.body.total >= google.body.total + microsoft.body.total);
  });

  it("filters the project list by owner", async () => {
    const mine = await project(ada.token, "Ada only");
    await project(bob.token, "Bob only");
    const found = await h.call(admin.token, "GET", `/api/projects?status=all&owner=${ada.id}&limit=100`);
    assert.equal(found.status, 200);
    assert.ok(names(found.body).includes("Ada only") && !names(found.body).includes("Bob only"));
    assert.ok(found.body.projects.every((p: any) => p.owner.id === ada.id));
    assert.equal((await h.call(admin.token, "GET", "/api/projects?owner=not-an-id")).status, 400);
    assert.ok(mine.id);
  });

  describe("stats and bulk actions", () => {
    it("reports workspace totals to admins only", async () => {
      const ok = await h.call(admin.token, "GET", "/api/admin/stats");
      assert.equal(ok.status, 200);
      for (const key of ["users", "admins", "members", "googleUsers", "microsoftUsers", "projects", "publicProjects", "privateProjects", "spriteProjects", "fontProjects", "draftProjects", "icons", "fontBuilds", "activeTokens"]) assert.equal(typeof ok.body[key], "number", key);
      assert.ok(ok.body.users >= 3 && ok.body.admins >= 1);
      assert.equal(ok.body.publicProjects + ok.body.privateProjects, ok.body.projects);
      assert.equal(ok.body.spriteProjects + ok.body.fontProjects, ok.body.projects);
      assert.equal(ok.body.admins + ok.body.members, ok.body.users);
      assert.ok(ok.body.googleUsers >= 3);
      assert.equal((await h.call(ada.token, "GET", "/api/admin/stats")).status, 403);
    });

    it("moves several projects to one user and reports the ones that could not move", async () => {
      const one = await project(ada.token, "Bulk one");
      const two = await project(ada.token, "Bulk two");
      const three = await project(bob.token, "Bulk three");
      const moved = await h.call(admin.token, "POST", "/api/admin/projects/bulk-transfer", { projectIds: [one.id, two.id, three.id], userId: bob.id });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.requested, 3);
      assert.equal(moved.body.done, 2);
      assert.deepEqual(moved.body.failed.map((f: any) => f.name), ["Bulk three"]);
      assert.equal((await h.call(bob.token, "GET", `/api/projects/${one.id}`)).body.access.canManage, true);
    });

    it("refuses bulk actions to other users and bad input", async () => {
      const p = await project(ada.token, "Bulk guarded");
      assert.equal((await h.call(ada.token, "POST", "/api/admin/projects/bulk-delete", { projectIds: [p.id] })).status, 403);
      assert.equal((await h.call(ada.token, "POST", "/api/admin/projects/bulk-transfer", { projectIds: [p.id], userId: bob.id })).status, 403);
      assert.equal((await h.call(admin.token, "POST", "/api/admin/projects/bulk-delete", { projectIds: [] })).status, 400);
      assert.equal((await h.call(admin.token, "POST", "/api/admin/projects/bulk-transfer", { projectIds: [p.id], userId: "x" })).status, 400);
      assert.equal((await h.call(admin.token, "POST", "/api/admin/projects/bulk-transfer", { projectIds: [p.id], userId: "6ad700000000000000000000" })).status, 404);
    });

    it("deletes several projects for good with their icons", async () => {
      const one = await project(ada.token, "Bulk del one");
      const two = await project(bob.token, "Bulk del two");
      await h.call(ada.token, "POST", `/api/projects/${one.id}/icons/paste`, { name: "x", rawSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h10v10z"/></svg>' });
      const gone = await h.call(admin.token, "POST", "/api/admin/projects/bulk-delete", { projectIds: [one.id, two.id, "6ad700000000000000000000"] });
      assert.equal(gone.status, 200);
      assert.equal(gone.body.done, 2);
      assert.equal(gone.body.deletedIcons, 1);
      assert.equal(gone.body.failed.length, 1);
      assert.equal((await h.call(admin.token, "GET", `/api/projects/${one.id}`)).status, 404);
    });
  });
});
