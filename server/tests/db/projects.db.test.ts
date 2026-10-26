// HTTP tests for projects and folders against a throwaway database: permissions for every kind of user, validation, counts, cascade delete, duplicate, and folder rules.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import Icon from "../../src/models/Icon.js";
import IconVersion from "../../src/models/IconVersion.js";
import Folder from "../../src/models/Folder.js";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

describe("projects and folders (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;
  let other: TestUser;
  let admin: TestUser;

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("owner");
    other = await h.makeUser("other");
    admin = await h.makeUser("admin", { admin: true });
  });
  after(() => h?.stop());

  const makeProject = async (token: string, body: Record<string, unknown> = {}) => {
    const r = await h.call(token, "POST", "/api/projects", { name: "Project", ...body });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const addIcon = (projectId: string, slug: string, over: Record<string, unknown> = {}) =>
    Icon.create({ projectId: new mongoose.Types.ObjectId(projectId), name: slug, slug, svg: SVG(), byteSize: 60, ...over });

  describe("sign-in and validation", () => {
    it("needs a signed-in user for everything", async () => {
      assert.equal((await h.call(null, "GET", "/api/projects")).status, 401);
      assert.equal((await h.call(null, "POST", "/api/projects", { name: "x" })).status, 401);
      assert.equal((await h.call("not-a-token", "GET", "/api/projects")).status, 401);
      const p = await makeProject(owner.token);
      assert.equal((await h.call(null, "GET", `/api/projects/${p.id}`)).status, 401);
      assert.equal((await h.call(null, "GET", `/api/projects/${p.id}/folders`)).status, 401);
      assert.equal((await h.call(null, "DELETE", `/api/folders/${p.id}`)).status, 401);
    });

    it("creates with defaults and reports access", async () => {
      const p = await makeProject(owner.token, { name: "  Feather  " });
      assert.equal(p.name, "Feather");
      assert.equal(p.purpose, "sprite");
      assert.equal(p.visibility, "private");
      assert.equal(p.iconCount, 0);
      assert.equal(p.owner.id, owner.id);
      assert.deepEqual(p.access, { canView: true, canCopyFrom: true, canEdit: true, canAddIcons: true, canManage: true });
    });

    it("rejects bad input with 400 and a readable message", async () => {
      for (const body of [{}, { name: "" }, { name: "x", color: "red" }, { name: "x", purpose: "video" }, { name: "x", ownerId: other.id }, { name: "x", prefix: "a b" }]) {
        const r = await h.call(owner.token, "POST", "/api/projects", body);
        assert.equal(r.status, 400, JSON.stringify(body));
        assert.equal(typeof r.body.error, "string");
      }
    });

    it("rejects malformed ids and malformed JSON", async () => {
      assert.equal((await h.call(owner.token, "GET", "/api/projects/not-an-id")).status, 400);
      const res = await fetch(`${h.baseUrl}/api/projects`, { method: "POST", headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" }, body: "{oops" });
      assert.equal(res.status, 400);
    });

    it("returns 404 for a project that does not exist", async () => {
      const r = await h.call(owner.token, "GET", `/api/projects/${new mongoose.Types.ObjectId()}`);
      assert.equal(r.status, 404);
    });
  });

  describe("visibility and permissions", () => {
    let pub: any;
    let priv: any;
    before(async () => {
      pub = await makeProject(owner.token, { name: "Public one", visibility: "public" });
      priv = await makeProject(owner.token, { name: "Private one", visibility: "private" });
    });

    it("lets another user see a public project, read-only", async () => {
      const r = await h.call(other.token, "GET", `/api/projects/${pub.id}`);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.access, { canView: true, canCopyFrom: true, canEdit: false, canAddIcons: false, canManage: false });
      assert.equal(r.body.owner.email, undefined, "other users do not see the owner's email");
    });

    it("hides a private project from others as if it did not exist", async () => {
      assert.equal((await h.call(other.token, "GET", `/api/projects/${priv.id}`)).status, 404);
      assert.equal((await h.call(other.token, "GET", `/api/projects/${priv.id}/folders`)).status, 404);
      assert.equal((await h.call(other.token, "PATCH", `/api/projects/${priv.id}`, { name: "x" })).status, 404);
    });

    it("lets an admin see and manage everything and see owner emails", async () => {
      const r = await h.call(admin.token, "GET", `/api/projects/${priv.id}`);
      assert.equal(r.status, 200);
      assert.equal(r.body.access.canManage, true);
      assert.equal(r.body.owner.email, owner.email);
    });

    it("forbids others from changing or deleting a public project", async () => {
      assert.equal((await h.call(other.token, "PATCH", `/api/projects/${pub.id}`, { name: "hacked" })).status, 403);
      assert.equal((await h.call(other.token, "DELETE", `/api/projects/${pub.id}`)).status, 403);
      assert.equal((await h.call(other.token, "POST", `/api/projects/${pub.id}/folders`, { name: "x" })).status, 403);
      const still = await h.call(owner.token, "GET", `/api/projects/${pub.id}`);
      assert.equal(still.body.name, "Public one");
    });

    it("lets the owner update, change visibility and archive, but never the purpose", async () => {
      const p = await makeProject(owner.token, { name: "Editable" });
      let r = await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, { name: "Renamed", visibility: "public", color: "#10b981" });
      assert.equal(r.status, 200);
      assert.equal(r.body.name, "Renamed");
      assert.equal(r.body.visibility, "public");
      assert.equal(r.body.color, "#10b981");
      assert.equal((await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, { purpose: "font" })).status, 400);
      assert.equal((await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, {})).status, 400);
      r = await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, { isArchived: true });
      assert.equal(r.body.isArchived, true);
    });
  });

  describe("listing", () => {
    let mineP: any, minePriv: any, theirsPub: any, theirsPriv: any;
    before(async () => {
      const lister = await h.makeUser("lister");
      mineP = await makeProject(lister.token, { name: "Zeta mine public", visibility: "public", prefix: "zeta" });
      minePriv = await makeProject(lister.token, { name: "Alpha mine private", purpose: "font" });
      theirsPub = await makeProject(owner.token, { name: "Theirs public", visibility: "public" });
      theirsPriv = await makeProject(owner.token, { name: "Theirs private" });
      (globalThis as any).__lister = lister;
    });
    const lister = () => (globalThis as any).__lister as TestUser;
    const names = (r: any) => r.body.projects.map((p: any) => p.name);

    it("shows a user their own projects plus public ones, never other people's private ones", async () => {
      const r = await h.call(lister().token, "GET", "/api/projects?limit=100");
      assert.equal(r.status, 200);
      const n = names(r);
      assert.ok(n.includes("Zeta mine public") && n.includes("Alpha mine private") && n.includes("Theirs public"));
      assert.ok(!n.includes("Theirs private"));
    });

    it("shows an admin everything", async () => {
      const n = names(await h.call(admin.token, "GET", "/api/projects?limit=100"));
      assert.ok(n.includes("Theirs private") && n.includes("Alpha mine private"));
    });

    it("filters by scope, purpose and search", async () => {
      assert.deepEqual(names(await h.call(lister().token, "GET", "/api/projects?scope=mine&sort=name")), ["Alpha mine private", "Zeta mine public"]);
      const pubOnly = names(await h.call(lister().token, "GET", "/api/projects?scope=public&limit=100"));
      assert.ok(pubOnly.includes("Theirs public") && !pubOnly.includes("Alpha mine private"));
      assert.deepEqual(names(await h.call(lister().token, "GET", "/api/projects?scope=mine&purpose=font")), ["Alpha mine private"]);
      assert.deepEqual(names(await h.call(lister().token, "GET", "/api/projects?scope=mine&search=ZETA")), ["Zeta mine public"]);
      assert.deepEqual(names(await h.call(lister().token, "GET", "/api/projects?scope=mine&search=a.b")), [], "search text is not treated as a pattern");
    });

    it("hides archived projects unless asked", async () => {
      await h.call(lister().token, "PATCH", `/api/projects/${minePriv.id}`, { isArchived: true });
      assert.deepEqual(names(await h.call(lister().token, "GET", "/api/projects?scope=mine")), ["Zeta mine public"]);
      assert.deepEqual(names(await h.call(lister().token, "GET", "/api/projects?scope=mine&status=archived")), ["Alpha mine private"]);
      assert.equal(names(await h.call(lister().token, "GET", "/api/projects?scope=mine&status=all")).length, 2);
    });

    it("counts active icons only, sorts by icon count, and returns up to 5 sample icons", async () => {
      for (const slug of ["a", "b", "c", "d", "e", "f", "g"]) await addIcon(mineP.id, slug);
      await addIcon(mineP.id, "trashed", { deletedAt: new Date() });
      const r = await h.call(lister().token, "GET", "/api/projects?scope=mine&status=all&sort=icons");
      assert.equal(r.body.projects[0].name, "Zeta mine public");
      assert.equal(r.body.projects[0].iconCount, 7, "trashed icons are not counted");
      assert.equal(r.body.projects[0].sampleIcons.length, 5);
      assert.match(r.body.projects[0].sampleIcons[0].svg, /^<svg/);
      assert.equal(r.body.projects[1].iconCount, 0);
    });

    it("pages results", async () => {
      const r = await h.call(lister().token, "GET", "/api/projects?scope=mine&status=all&sort=name&limit=1&page=2");
      assert.equal(r.body.total, 2);
      assert.equal(r.body.projects.length, 1);
      assert.equal(r.body.projects[0].name, "Zeta mine public");
    });

    it("refuses nonsense query values", async () => {
      assert.equal((await h.call(owner.token, "GET", "/api/projects?sort=random")).status, 400);
      assert.equal((await h.call(owner.token, "GET", "/api/projects?limit=0")).status, 400);
    });
  });

  describe("project detail", () => {
    it("reports counts for icons, folders and trash", async () => {
      const p = await makeProject(owner.token, { name: "Counted" });
      const f = await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "UI" });
      await addIcon(p.id, "one", { folderId: f.body.id });
      await addIcon(p.id, "two");
      await addIcon(p.id, "gone", { deletedAt: new Date() });
      const r = await h.call(owner.token, "GET", `/api/projects/${p.id}`);
      assert.equal(r.body.iconCount, 2);
      assert.equal(r.body.folderCount, 1);
      assert.equal(r.body.trashCount, 1);
    });
  });

  describe("delete", () => {
    it("removes the project with its folders, icons and versions", async () => {
      const p = await makeProject(owner.token, { name: "To delete" });
      const f = await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "F" });
      const icon = await addIcon(p.id, "i1", { folderId: f.body.id });
      await addIcon(p.id, "i2", { deletedAt: new Date() });
      await IconVersion.create({ iconId: icon._id, svg: SVG(), byteSize: 60 });
      const r = await h.call(owner.token, "DELETE", `/api/projects/${p.id}`);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { deletedIcons: 2, deletedFolders: 1 });
      assert.equal(await Icon.countDocuments({ projectId: p.id }), 0);
      assert.equal(await Folder.countDocuments({ projectId: p.id }), 0);
      assert.equal(await IconVersion.countDocuments({ iconId: icon._id }), 0);
      assert.equal((await h.call(owner.token, "GET", `/api/projects/${p.id}`)).status, 404);
    });

    it("does not touch other projects", async () => {
      const keep = await makeProject(owner.token, { name: "Keep" });
      const drop = await makeProject(owner.token, { name: "Drop" });
      await addIcon(keep.id, "same-slug");
      await addIcon(drop.id, "same-slug");
      await h.call(owner.token, "DELETE", `/api/projects/${drop.id}`);
      assert.equal(await Icon.countDocuments({ projectId: keep.id }), 1);
    });
  });

  describe("duplicate", () => {
    it("copies a public project into a private one the copier owns, keeping the folder tree and active icons", async () => {
      const src = await makeProject(owner.token, { name: "Source", visibility: "public", purpose: "font", prefix: "src" });
      const parent = await h.call(owner.token, "POST", `/api/projects/${src.id}/folders`, { name: "Parent" });
      const child = await h.call(owner.token, "POST", `/api/projects/${src.id}/folders`, { name: "Child", parentId: parent.body.id });
      // Make the child sort before its parent, to prove parents are still created first.
      await Folder.updateOne({ _id: child.body.id }, { orderIndex: 0 });
      await Folder.updateOne({ _id: parent.body.id }, { orderIndex: 5 });
      await addIcon(src.id, "in-child", { folderId: child.body.id, tags: ["x"], codepoint: "E001" });
      await addIcon(src.id, "at-root");
      await addIcon(src.id, "trashed", { deletedAt: new Date() });

      const r = await h.call(other.token, "POST", `/api/projects/${src.id}/duplicate`);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.name, "Source (Copy)");
      assert.equal(r.body.visibility, "private");
      assert.equal(r.body.purpose, "font");
      assert.equal(r.body.owner.id, other.id);
      assert.equal(r.body.iconCount, 2, "the trashed icon is not copied");
      assert.equal(r.body.folderCount, 2);

      const folders = (await h.call(other.token, "GET", `/api/projects/${r.body.id}/folders`)).body.folders;
      const newParent = folders.find((f: any) => f.name === "Parent");
      const newChild = folders.find((f: any) => f.name === "Child");
      assert.equal(newChild.parentId, newParent.id, "the child is under the copied parent");
      assert.equal(newChild.iconCount, 1);
      const copied = await Icon.findOne({ projectId: r.body.id, slug: "in-child" });
      assert.equal(copied?.codepoint, "E001");
      assert.deepEqual([...(copied?.tags ?? [])], ["x"]);
      assert.equal(await Icon.countDocuments({ projectId: src.id, deletedAt: null }), 2, "the source is unchanged");
    });

    it("refuses to copy a private project of someone else", async () => {
      const priv = await makeProject(owner.token, { name: "Hidden" });
      assert.equal((await h.call(other.token, "POST", `/api/projects/${priv.id}/duplicate`)).status, 404);
    });
  });

  describe("folders", () => {
    let project: any;
    before(async () => {
      project = await makeProject(owner.token, { name: "Folder tests", visibility: "public" });
    });
    const create = (token: string, body: unknown, id = () => project.id) => h.call(token, "POST", `/api/projects/${id()}/folders`, body);

    it("creates root folders and subfolders in order", async () => {
      const a = await create(owner.token, { name: "A" });
      const b = await create(owner.token, { name: "B" });
      const a1 = await create(owner.token, { name: "A1", parentId: a.body.id });
      assert.equal(a.status, 201);
      assert.equal(a.body.parentId, null);
      assert.equal(b.body.orderIndex, a.body.orderIndex + 1);
      assert.equal(a1.body.parentId, a.body.id);
    });

    it("refuses duplicate sibling names, ignoring case, but allows them under different parents", async () => {
      const a = await create(owner.token, { name: "Dup" });
      assert.equal((await create(owner.token, { name: "dup" })).status, 409);
      const x = await create(owner.token, { name: "X" });
      assert.equal((await create(owner.token, { name: "Dup", parentId: x.body.id })).status, 201);
      assert.ok(a.body.id);
    });

    it("refuses a parent from another project or one that does not exist", async () => {
      const otherProject = await makeProject(owner.token, { name: "Elsewhere" });
      const foreign = await h.call(owner.token, "POST", `/api/projects/${otherProject.id}/folders`, { name: "Foreign" });
      const clash = await create(owner.token, { name: "Child", parentId: foreign.body.id });
      assert.equal(clash.status, 400);
      assert.match(clash.body.error, /does not exist in this project/);
      assert.equal((await create(owner.token, { name: "Child", parentId: String(new mongoose.Types.ObjectId()) })).status, 400);
      assert.equal((await create(owner.token, { name: "Child", parentId: "nope" })).status, 400);
    });

    it("lists folders with icon counts and the uncategorized count", async () => {
      const p = await makeProject(owner.token, { name: "Listing" });
      const f = await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "F" });
      await addIcon(p.id, "in-f", { folderId: f.body.id });
      await addIcon(p.id, "in-f-2", { folderId: f.body.id });
      await addIcon(p.id, "loose");
      await addIcon(p.id, "trashed", { folderId: f.body.id, deletedAt: new Date() });
      const r = await h.call(other.token, "GET", `/api/projects/${p.id}/folders`);
      assert.equal(r.status, 404, "private projects stay hidden");
      const mine = await h.call(owner.token, "GET", `/api/projects/${p.id}/folders`);
      assert.equal(mine.body.folders[0].iconCount, 2);
      assert.equal(mine.body.uncategorizedCount, 1);
    });

    it("renames, refusing a clash", async () => {
      const p = await makeProject(owner.token, { name: "Rename" });
      const a = await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "A" });
      await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "B" });
      assert.equal((await h.call(owner.token, "PATCH", `/api/folders/${a.body.id}`, { name: "b" })).status, 409);
      const ok = await h.call(owner.token, "PATCH", `/api/folders/${a.body.id}`, { name: "Renamed" });
      assert.equal(ok.body.name, "Renamed");
      assert.equal((await h.call(owner.token, "PATCH", `/api/folders/${a.body.id}`, { name: "" })).status, 400);
    });

    it("moves a folder, to the root with null, but never into itself or a descendant", async () => {
      const p = await makeProject(owner.token, { name: "Moves" });
      const mk = (name: string, parentId: string | null = null) => h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name, parentId });
      const a = await mk("A");
      const b = await mk("B", a.body.id);
      const c = await mk("C", b.body.id);
      const move = (id: string, parentId: string | null) => h.call(owner.token, "POST", `/api/folders/${id}/move`, { parentId });
      assert.equal((await move(a.body.id, a.body.id)).status, 400, "into itself");
      assert.equal((await move(a.body.id, c.body.id)).status, 400, "into a grandchild");
      assert.equal((await move(a.body.id, b.body.id)).status, 400, "into a child");
      const ok = await move(c.body.id, a.body.id);
      assert.equal(ok.status, 200);
      assert.equal(ok.body.parentId, a.body.id);
      const root = await move(c.body.id, null);
      assert.equal(root.body.parentId, null);
      await mk("C"); // now a root folder named C exists...
      assert.equal((await move(b.body.id, null)).status, 200);
      const clash = await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Z", parentId: a.body.id });
      await h.call(owner.token, "PATCH", `/api/folders/${clash.body.id}`, { name: "C" });
      assert.equal((await move(clash.body.id, null)).status, 409, "a sibling with the same name at the destination");
    });

    it("refuses to move a folder under a parent from another project", async () => {
      const p1 = await makeProject(owner.token, { name: "P1" });
      const p2 = await makeProject(owner.token, { name: "P2" });
      const f1 = await h.call(owner.token, "POST", `/api/projects/${p1.id}/folders`, { name: "F1" });
      const f2 = await h.call(owner.token, "POST", `/api/projects/${p2.id}/folders`, { name: "F2" });
      const r = await h.call(owner.token, "POST", `/api/folders/${f1.body.id}/move`, { parentId: f2.body.id });
      assert.equal(r.status, 400);
      assert.match(r.body.error, /does not exist in this project/);
    });

    it("deleting a folder removes its subfolders and moves all their icons to the root", async () => {
      const p = await makeProject(owner.token, { name: "Deleting" });
      const mk = (name: string, parentId: string | null = null) => h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name, parentId });
      const a = await mk("A");
      const b = await mk("B", a.body.id);
      const keep = await mk("Keep");
      await addIcon(p.id, "in-a", { folderId: a.body.id });
      await addIcon(p.id, "in-b", { folderId: b.body.id });
      await addIcon(p.id, "trashed-in-b", { folderId: b.body.id, deletedAt: new Date() });
      await addIcon(p.id, "in-keep", { folderId: keep.body.id });
      const r = await h.call(owner.token, "DELETE", `/api/folders/${a.body.id}`);
      assert.deepEqual(r.body, { deletedFolders: 2, movedIcons: 3 });
      assert.equal(await Icon.countDocuments({ projectId: p.id }), 4, "no icon is deleted");
      assert.equal(await Icon.countDocuments({ projectId: p.id, folderId: null }), 3);
      const left = await h.call(owner.token, "GET", `/api/projects/${p.id}/folders`);
      assert.deepEqual(left.body.folders.map((f: any) => f.name), ["Keep"]);
    });

    it("lets only people who can edit the project change its folders", async () => {
      const f = await create(owner.token, { name: "Protected" });
      assert.equal((await h.call(other.token, "PATCH", `/api/folders/${f.body.id}`, { name: "x" })).status, 403);
      assert.equal((await h.call(other.token, "POST", `/api/folders/${f.body.id}/move`, { parentId: null })).status, 403);
      assert.equal((await h.call(other.token, "DELETE", `/api/folders/${f.body.id}`)).status, 403);
      assert.equal((await h.call(other.token, "GET", `/api/projects/${project.id}/folders`)).status, 200, "viewing a public project's folders is fine");
      assert.equal((await h.call(admin.token, "PATCH", `/api/folders/${f.body.id}`, { name: "By admin" })).status, 200);
      assert.equal((await h.call(owner.token, "GET", `/api/folders/${new mongoose.Types.ObjectId()}`)).status, 404);
    });

    it("reports a folder in a private project as missing to outsiders", async () => {
      const p = await makeProject(owner.token, { name: "Secret folders" });
      const f = await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Hidden" });
      assert.equal((await h.call(other.token, "DELETE", `/api/folders/${f.body.id}`)).status, 404);
    });
  });
});
