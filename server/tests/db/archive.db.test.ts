// HTTP tests for project export and import, and the server-built sprite, against a throwaway database: permissions, a full round trip (settings, folders, tags, codepoints), safety of imported SVGs, damaged archives, and the sprite endpoint.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import Folder from "../../src/models/Folder.js";
import Icon from "../../src/models/Icon.js";
import Project from "../../src/models/Project.js";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

describe("project export, import and sprite (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;
  let other: TestUser;
  let source: { id: string };

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("owner");
    other = await h.makeUser("other");
    source = (await h.call(owner.token, "POST", "/api/projects", { name: "Feather", prefix: "fth", description: "Line icons", color: "#7c3aed", purpose: "font", visibility: "public" })).body;
    const ui = (await h.call(owner.token, "POST", `/api/projects/${source.id}/folders`, { name: "UI" })).body;
    const arrows = (await h.call(owner.token, "POST", `/api/projects/${source.id}/folders`, { name: "Arrows", parentId: ui.id })).body;
    await h.call(owner.token, "POST", `/api/projects/${source.id}/folders`, { name: "Empty" });
    const post = (name: string, folderId: string | null, tags: string[]) => {
      const fd = new FormData();
      fd.append("files", new Blob([SVG('<path d="M1 1h4"/>', 'fill="none" stroke="currentColor"')], { type: "image/svg+xml" }), `${name}.svg`);
      fd.append("folderId", folderId ?? "");
      fd.append("tags", JSON.stringify(tags));
      return h.call(owner.token, "POST", `/api/projects/${source.id}/icons/upload`, fd);
    };
    await post("home", null, ["nav"]);
    await post("left", arrows.id, ["arrow", "nav"]);
    await post("star", ui.id, []);
    const star = await Icon.findOne({ projectId: source.id, slug: "star" });
    await h.call(owner.token, "PATCH", `/api/icons/${star?._id}`, { codepoint: "E001" });
    const trash = await post("gone", null, []);
    await h.call(owner.token, "DELETE", `/api/icons/${trash.body.created[0].id}`);
  });
  after(() => h?.stop());

  const exportZip = async (token: string, projectId = source.id) => {
    const r = await h.call(token, "GET", `/api/projects/${projectId}/export`);
    return { r, zip: Buffer.from(await r.raw.arrayBuffer()) };
  };
  const importZip = (token: string, zip: Buffer | Uint8Array) => {
    const fd = new FormData();
    fd.append("file", new Blob([zip as BlobPart], { type: "application/zip" }), "export.zip");
    return h.call(token, "POST", "/api/projects/import", fd);
  };

  describe("export", () => {
    it("needs sign-in and a project you can see", async () => {
      assert.equal((await h.call(null, "GET", `/api/projects/${source.id}/export`)).status, 401);
      const priv = (await h.call(owner.token, "POST", "/api/projects", { name: "Private" })).body;
      assert.equal((await h.call(other.token, "GET", `/api/projects/${priv.id}/export`)).status, 404);
      assert.equal((await h.call(other.token, "GET", `/api/projects/${source.id}/export`)).status, 200);
    });

    it("writes project.json and one SVG per active icon, in folders, without the trash", async () => {
      const { r, zip } = await exportZip(owner.token);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-disposition") ?? "", /feather-export\.zip/);
      const files = unzipSync(new Uint8Array(zip));
      assert.deepEqual(Object.keys(files).sort(), ["icons/UI/Arrows/left.svg", "icons/UI/star.svg", "icons/home.svg", "project.json"]);
      const manifest = JSON.parse(strFromU8(files["project.json"] as Uint8Array));
      assert.equal(manifest.format, "iconvault-project");
      assert.deepEqual(manifest.project, { name: "Feather", description: "Line icons", prefix: "fth", color: "#7c3aed", purpose: "font" });
      assert.deepEqual(manifest.folders.map((f: string[]) => f.join("/")).sort(), ["Empty", "UI", "UI/Arrows"]);
      const left = manifest.icons.find((i: { name: string }) => i.name === "left");
      assert.deepEqual({ folder: left.folder, tags: left.tags }, { folder: ["UI", "Arrows"], tags: ["arrow", "nav"] });
      assert.equal(manifest.icons.find((i: { name: string }) => i.name === "star").codepoint, "E001");
    });
  });

  describe("import", () => {
    it("rebuilds the project for whoever imports it: private, owned by them, same settings, folders, tags and codepoints", async () => {
      const { zip } = await exportZip(other.token);
      const r = await importZip(other.token, zip);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.imported, 3);
      assert.deepEqual(r.body.problems, []);
      assert.equal(r.body.foldersCreated, 3);
      const p = r.body.project;
      assert.deepEqual({ name: p.name, prefix: p.prefix, purpose: p.purpose, visibility: p.visibility, owner: p.owner.id, icons: p.iconCount, folders: p.folderCount }, { name: "Feather", prefix: "fth", purpose: "font", visibility: "private", owner: other.id, icons: 3, folders: 3 });

      const icons = await Icon.find({ projectId: p.id }).lean();
      assert.deepEqual(icons.map((i) => i.slug).sort(), ["home", "left", "star"]);
      assert.equal(icons.find((i) => i.slug === "star")?.codepoint, "E001");
      assert.deepEqual(icons.find((i) => i.slug === "left")?.tags, ["arrow", "nav"]);
      const leftFolder = await Folder.findById(icons.find((i) => i.slug === "left")?.folderId).lean();
      assert.equal(leftFolder?.name, "Arrows");
      // The original is untouched.
      assert.equal(await Icon.countDocuments({ projectId: source.id, deletedAt: null }), 3);
    });

    it("names a second import of the same project differently", async () => {
      const { zip } = await exportZip(other.token);
      const r = await importZip(other.token, zip);
      assert.equal(r.body.project.name, "Feather (Imported)");
    });

    it("cleans every SVG on the way in, whatever the archive claims", async () => {
      const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><script>alert(1)</script><path d="M1 1"/></svg>';
      const manifest = { format: "svg-sprite-compiler-project", version: 1, project: { name: "Evil", description: "", prefix: "ev", color: "#3b82f6", purpose: "sprite" }, folders: [], icons: [{ file: "icons/a.svg", name: "A", folder: ["../../x"], tags: [], codepoint: null }] };
      const r = await importZip(other.token, zipSync({ "project.json": strToU8(JSON.stringify(manifest)), "icons/a.svg": strToU8(evil) }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const icon = await Icon.findOne({ projectId: r.body.project.id }).lean();
      assert.doesNotMatch(icon?.svg ?? "", /script|onload/i);
      const folder = await Folder.findOne({ projectId: r.body.project.id }).lean();
      assert.equal(folder?.name === ".." || folder?.name === ".", false);
    });

    it("reports icons it could not import and files missing from the archive, and keeps the rest", async () => {
      const manifest = {
        format: "svg-sprite-compiler-project",
        version: 1,
        project: { name: "Partial", description: "", prefix: "pt", color: "#3b82f6", purpose: "sprite" },
        folders: [],
        icons: [
          { file: "icons/good.svg", name: "Good", folder: [], tags: [], codepoint: null },
          { file: "icons/bad.svg", name: "Bad", folder: [], tags: [], codepoint: null },
          { file: "icons/missing.svg", name: "Missing", folder: [], tags: [], codepoint: null },
        ],
      };
      const r = await importZip(other.token, zipSync({ "project.json": strToU8(JSON.stringify(manifest)), "icons/good.svg": strToU8(SVG()), "icons/bad.svg": strToU8("<svg><") }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.imported, 1);
      assert.deepEqual(r.body.problems.map((p: { file: string }) => p.file).sort(), ["icons/bad.svg", "icons/missing.svg"]);
    });

    it("creates nothing when no icon can be imported", async () => {
      const before = await Project.countDocuments({ ownerId: other.id });
      const manifest = { format: "svg-sprite-compiler-project", version: 1, project: { name: "Nothing", description: "", prefix: "no", color: "#3b82f6", purpose: "sprite" }, folders: [], icons: [{ file: "icons/bad.svg", name: "Bad", folder: [], tags: [], codepoint: null }] };
      const r = await importZip(other.token, zipSync({ "project.json": strToU8(JSON.stringify(manifest)), "icons/bad.svg": strToU8("<svg><") }));
      assert.equal(r.status, 400);
      assert.equal(await Project.countDocuments({ ownerId: other.id }), before);
    });

    it("accepts an empty project and refuses damaged or foreign archives", async () => {
      const empty = { format: "svg-sprite-compiler-project", version: 1, project: { name: "Empty one", description: "", prefix: "em", color: "#3b82f6", purpose: "sprite" }, folders: [], icons: [] };
      assert.equal((await importZip(other.token, zipSync({ "project.json": strToU8(JSON.stringify(empty)) }))).status, 201);
      assert.equal((await importZip(other.token, Buffer.from("definitely not a zip"))).status, 400);
      assert.equal((await importZip(other.token, zipSync({ "hello.txt": strToU8("hi") }))).status, 400);
      assert.equal((await importZip(null as unknown as string, zipSync({}))).status, 401);
      const none = await h.call(other.token, "POST", "/api/projects/import", new FormData());
      assert.equal(none.status, 400);
    });
  });

  describe("sprite", () => {
    it("builds one symbol per active icon with the project prefix", async () => {
      const r = await h.call(owner.token, "GET", `/api/projects/${source.id}/sprite`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("x-sprite-symbols"), "3");
      assert.match(r.headers.get("content-type") ?? "", /image\/svg\+xml/);
      const xml = String(r.body);
      assert.deepEqual([...xml.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]), ["fth-home", "fth-left", "fth-star"]);
      assert.match(xml, /<symbol id="fth-home" viewBox="0 0 24 24"><g fill="none" stroke="currentColor">/);
    });

    it("can be limited to a folder with its subfolders, or to uncategorized icons", async () => {
      const ui = await Folder.findOne({ projectId: source.id, name: "UI" });
      const inUi = await h.call(owner.token, "GET", `/api/projects/${source.id}/sprite?folderId=${ui?._id}`);
      assert.deepEqual([...String(inUi.body).matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]), ["fth-left", "fth-star"]);
      const root = await h.call(owner.token, "GET", `/api/projects/${source.id}/sprite?folderId=root`);
      assert.deepEqual([...String(root.body).matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]), ["fth-home"]);
      assert.equal((await h.call(owner.token, "GET", `/api/projects/${source.id}/sprite?folderId=nope`)).status, 400);
    });

    it("follows the visibility rules", async () => {
      const priv = (await h.call(owner.token, "POST", "/api/projects", { name: "Hidden" })).body;
      assert.equal((await h.call(other.token, "GET", `/api/projects/${priv.id}/sprite`)).status, 404);
      assert.equal((await h.call(other.token, "GET", `/api/projects/${source.id}/sprite`)).status, 200);
      assert.equal((await h.call(null, "GET", `/api/projects/${source.id}/sprite`)).status, 401);
    });
  });
});
