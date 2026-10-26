// Database tests for the Project, Folder, Icon and IconVersion models. They run against a throwaway database on the configured cluster (never the real one) and drop it afterwards. Run with: npm run test:db
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import mongoose, { type Connection } from "mongoose";
import { projectSchema } from "../../src/models/Project.js";
import { folderSchema } from "../../src/models/Folder.js";
import { iconSchema } from "../../src/models/Icon.js";
import { iconVersionSchema } from "../../src/models/IconVersion.js";

const uri = process.env.MONGODB_URI;
const dbName = `svg-compiler-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("models (throwaway database)", { skip: uri ? false : "MONGODB_URI is not set" }, () => {
  let conn: Connection;
  let Project: mongoose.Model<any>;
  let Folder: mongoose.Model<any>;
  let Icon: mongoose.Model<any>;
  let IconVersion: mongoose.Model<any>;
  const ownerId = new mongoose.Types.ObjectId();

  before(async () => {
    // Safety: only ever touch a database created by this test.
    assert.match(dbName, /^svg-compiler-test-/);
    conn = await mongoose.createConnection(uri as string, { dbName, serverSelectionTimeoutMS: 15000 }).asPromise();
    Project = conn.model("Project", projectSchema);
    Folder = conn.model("Folder", folderSchema);
    Icon = conn.model("Icon", iconSchema);
    IconVersion = conn.model("IconVersion", iconVersionSchema);
    await Promise.all([Project, Folder, Icon, IconVersion].map((m) => m.syncIndexes()));
  });

  after(async () => {
    if (conn) {
      assert.match(conn.name, /^svg-compiler-test-/);
      await conn.dropDatabase();
      await conn.close();
    }
  });

  const iconData = (projectId: unknown, over: Record<string, unknown> = {}) => ({
    projectId,
    name: "Arrow",
    slug: "arrow",
    svg: '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>',
    byteSize: 40,
    ...over,
  });

  it("applies project defaults and trims input", async () => {
    const p = await Project.create({ ownerId, name: "  Feather  " });
    assert.equal(p.name, "Feather");
    assert.equal(p.purpose, "sprite");
    assert.equal(p.visibility, "private");
    assert.equal(p.prefix, "icon");
    assert.equal(p.color, "#3b82f6");
    assert.equal(p.isArchived, false);
    assert.ok(p.createdAt && p.updatedAt);
  });

  it("rejects an invalid project", async () => {
    await assert.rejects(Project.create({ ownerId, name: "" }), /name/);
    await assert.rejects(Project.create({ ownerId, name: "x", color: "red" }), /color/);
    await assert.rejects(Project.create({ ownerId, name: "x", purpose: "video" }), /purpose/);
    await assert.rejects(Project.create({ ownerId, name: "x", visibility: "team" }), /visibility/);
    await assert.rejects(Project.create({ name: "no owner" }), /ownerId/);
  });

  it("creates folders that nest", async () => {
    const p = await Project.create({ ownerId, name: "Nested" });
    const root = await Folder.create({ projectId: p._id, name: "UI" });
    const child = await Folder.create({ projectId: p._id, parentId: root._id, name: "Arrows" });
    assert.equal(root.parentId, null);
    assert.equal(String(child.parentId), String(root._id));
  });

  it("stores icons with sensible defaults", async () => {
    const p = await Project.create({ ownerId, name: "Defaults" });
    const icon = await Icon.create(iconData(p._id));
    assert.equal(icon.folderId, null);
    assert.equal(icon.deletedAt, null);
    assert.equal(icon.codepoint, null);
    assert.deepEqual([...icon.tags], []);
    assert.equal(icon.width, 24);
    assert.equal(icon.viewBox, "0 0 24 24");
    assert.equal(icon.hasStroke, false);
  });

  it("validates icon fields", async () => {
    const p = await Project.create({ ownerId, name: "Validation" });
    await assert.rejects(Icon.create(iconData(p._id, { slug: "Bad Slug!" })), /slug/);
    await assert.rejects(Icon.create(iconData(p._id, { codepoint: "ZZZZ" })), /codepoint/);
    await assert.rejects(Icon.create(iconData(p._id, { svg: "" })), /svg/);
    const ok = await Icon.create(iconData(p._id, { slug: "ok", codepoint: "e001" }));
    assert.equal(ok.codepoint, "E001", "codepoints are stored upper-case");
  });

  it("keeps slugs unique among active icons only", async () => {
    const p = await Project.create({ ownerId, name: "Slugs" });
    const first = await Icon.create(iconData(p._id, { slug: "home" }));
    await assert.rejects(Icon.create(iconData(p._id, { slug: "home" })), (e: any) => e.code === 11000);

    // Trash the first one: the slug becomes available again.
    await Icon.updateOne({ _id: first._id }, { deletedAt: new Date() });
    const second = await Icon.create(iconData(p._id, { slug: "home" }));
    assert.ok(second._id);

    // A different project may reuse the same slug.
    const other = await Project.create({ ownerId, name: "Other" });
    await Icon.create(iconData(other._id, { slug: "home" }));

    // Restoring the trashed icon while the slug is taken must be refused by the index.
    await assert.rejects(Icon.updateOne({ _id: first._id }, { deletedAt: null }), (e: any) => e.code === 11000);
  });

  it("keeps codepoints unique per project among active icons, allowing many without one", async () => {
    const p = await Project.create({ ownerId, name: "Codepoints" });
    await Icon.create(iconData(p._id, { slug: "a", codepoint: "E001" }));
    await assert.rejects(Icon.create(iconData(p._id, { slug: "b", codepoint: "E001" })), (e: any) => e.code === 11000);

    // Several icons without a codepoint are fine.
    await Icon.create(iconData(p._id, { slug: "c" }));
    await Icon.create(iconData(p._id, { slug: "d" }));

    // A trashed icon releases its codepoint.
    const trashed = await Icon.create(iconData(p._id, { slug: "e", codepoint: "E002" }));
    await Icon.updateOne({ _id: trashed._id }, { deletedAt: new Date() });
    await Icon.create(iconData(p._id, { slug: "f", codepoint: "E002" }));

    // The same codepoint in another project is fine.
    const other = await Project.create({ ownerId, name: "Codepoints 2" });
    await Icon.create(iconData(other._id, { slug: "a", codepoint: "E001" }));
  });

  it("stores icon versions with their own content", async () => {
    const p = await Project.create({ ownerId, name: "Versions" });
    const icon = await Icon.create(iconData(p._id, { slug: "v" }));
    const v1 = await IconVersion.create({ iconId: icon._id, svg: "<svg>old</svg>", byteSize: 14 });
    const v2 = await IconVersion.create({ iconId: icon._id, svg: "<svg>older</svg>", byteSize: 16 });
    assert.ok(v1.createdAt);
    assert.equal(v1.updatedAt, undefined);
    const history = await IconVersion.find({ iconId: icon._id }).sort({ createdAt: -1, _id: -1 });
    assert.equal(history.length, 2);
    assert.equal(history[0].svg, v2.svg);
    assert.equal(history[1].svg, "<svg>old</svg>", "each version keeps its own markup");
  });

  it("builds the expected indexes", async () => {
    const names = async (m: mongoose.Model<any>) => (await m.listIndexes()).map((i: any) => i.name).sort();
    assert.ok((await names(Icon)).includes("projectId_1_slug_1"));
    assert.ok((await names(Icon)).includes("projectId_1_codepoint_1"));
    assert.ok((await names(Folder)).includes("projectId_1_parentId_1_orderIndex_1"));
    assert.ok((await names(Project)).includes("ownerId_1_updatedAt_-1"));
    assert.ok((await names(IconVersion)).includes("iconId_1_createdAt_-1"));
  });
});
