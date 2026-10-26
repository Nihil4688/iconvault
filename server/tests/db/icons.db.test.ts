// HTTP tests for icons against a throwaway database: paste, upload (files and ZIPs), duplicate strategies, editing, versions, trash, batch actions that stay inside one project, copy between projects, listing, search and downloads.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import mongoose from "mongoose";
import Icon from "../../src/models/Icon.js";
import IconVersion from "../../src/models/IconVersion.js";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

const MESSY = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: a design tool -->
<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
  <desc>Created with a tool</desc>
  <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
    <g id="icon" fill="#000000" fill-rule="nonzero">
      <path d="M 12.000 4.000 L 10.590 5.410 L 16.170 11.000 L 4.000 11.000 L 4.000 13.000 L 16.170 13.000 L 10.590 18.590 L 12.000 20.000 L 20.000 12.000 Z" id="Path"></path>
    </g>
  </g>
</svg>`;

const file = (name: string, text: string, type = "image/svg+xml") => new File([text], name, { type });
const form = (files: File[], fields: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};

describe("icons (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;
  let other: TestUser;
  let admin: TestUser;
  let pub: any;
  let priv: any;

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("owner");
    other = await h.makeUser("other");
    admin = await h.makeUser("admin", { admin: true });
    pub = (await h.call(owner.token, "POST", "/api/projects", { name: "Public", visibility: "public" })).body;
    priv = (await h.call(owner.token, "POST", "/api/projects", { name: "Private" })).body;
  });
  after(() => h?.stop());

  const newProject = async (name: string, over: Record<string, unknown> = {}) =>
    (await h.call(owner.token, "POST", "/api/projects", { name, ...over })).body;
  const paste = (projectId: string, name: string, svg = SVG(), over: Record<string, unknown> = {}, token = owner.token) =>
    h.call(token, "POST", `/api/projects/${projectId}/icons/paste`, { name, rawSvg: svg, ...over });
  const mk = async (projectId: string, name: string, svg = SVG(), over: Record<string, unknown> = {}) => {
    const r = await paste(projectId, name, svg, over);
    assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body));
    return r.body.icon;
  };
  const list = (token: string, projectId: string, qs = "") => h.call(token, "GET", `/api/projects/${projectId}/icons${qs}`);

  describe("sign-in and access", () => {
    it("needs sign-in everywhere", async () => {
      const icon = await mk(pub.id, "Guarded");
      for (const [method, path] of [
        ["GET", `/api/projects/${pub.id}/icons`],
        ["POST", `/api/projects/${pub.id}/icons/upload`],
        ["POST", `/api/projects/${pub.id}/icons/paste`],
        ["GET", `/api/icons/search?q=a`],
        ["GET", `/api/icons/${icon.id}`],
        ["GET", `/api/icons/${icon.id}/download`],
        ["PATCH", `/api/icons/${icon.id}`],
        ["DELETE", `/api/icons/${icon.id}`],
      ] as const) {
        assert.equal((await h.call(null, method, path)).status, 401, `${method} ${path}`);
      }
    });

    it("lets others view a public project's icons but not change them", async () => {
      const icon = await mk(pub.id, "Look only");
      assert.equal((await list(other.token, pub.id)).status, 200);
      assert.equal((await h.call(other.token, "GET", `/api/icons/${icon.id}`)).status, 200);
      assert.equal((await paste(pub.id, "Sneaky", SVG(), {}, other.token)).status, 403);
      assert.equal((await h.call(other.token, "POST", `/api/projects/${pub.id}/icons/upload`, form([file("x.svg", SVG())]))).status, 403);
      assert.equal((await h.call(other.token, "PATCH", `/api/icons/${icon.id}`, { name: "Hacked" })).status, 403);
      assert.equal((await h.call(other.token, "DELETE", `/api/icons/${icon.id}`)).status, 403);
      assert.equal((await h.call(other.token, "POST", `/api/icons/${icon.id}/optimize`)).status, 403);
      assert.equal((await h.call(other.token, "POST", `/api/projects/${pub.id}/icons/batch/delete`, { iconIds: [icon.id] })).status, 403);
      assert.equal((await h.call(other.token, "DELETE", `/api/projects/${pub.id}/icons/trash`)).status, 403);
    });

    it("hides everything in a private project from others", async () => {
      const icon = await mk(priv.id, "Secret");
      assert.equal((await list(other.token, priv.id)).status, 404);
      assert.equal((await h.call(other.token, "GET", `/api/icons/${icon.id}`)).status, 404);
      assert.equal((await h.call(other.token, "GET", `/api/icons/${icon.id}/download`)).status, 404);
      assert.equal((await h.call(other.token, "PATCH", `/api/icons/${icon.id}`, { name: "x" })).status, 404);
      assert.equal((await h.call(other.token, "GET", `/api/icons/${new mongoose.Types.ObjectId()}`)).status, 404);
      assert.equal((await h.call(admin.token, "GET", `/api/icons/${icon.id}`)).status, 200);
    });

    it("rejects malformed ids", async () => {
      assert.equal((await h.call(owner.token, "GET", "/api/icons/not-an-id")).status, 400);
      assert.equal((await h.call(owner.token, "GET", "/api/projects/nope/icons")).status, 400);
    });
  });

  describe("paste", () => {
    it("creates an icon, optimized, with size and flags read from the final markup", async () => {
      const p = await newProject("Paste");
      const r = await paste(p.id, "  Arrow Left ", MESSY, { tags: ["UI", "ui", " Nav "] });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const icon = r.body.icon;
      assert.equal(r.body.outcome, "created");
      assert.equal(icon.name, "Arrow Left");
      assert.equal(icon.slug, "arrow-left");
      assert.deepEqual(icon.tags, ["ui", "nav"]);
      assert.ok(icon.byteSize < icon.originalByteSize, "optimizing shrank it");
      assert.equal(icon.width, 24, "size comes from the viewBox after width/height are removed");
      assert.equal(icon.hasStroke, false);
      assert.match(icon.svg, /viewBox="0 0 24 24"/);
      assert.doesNotMatch(icon.svg, /<!--|<desc/);
      assert.equal(icon.codepoint, null);
    });

    it("can skip optimizing", async () => {
      const p = await newProject("No optimize");
      const r = await paste(p.id, "Raw", MESSY, { optimize: false });
      assert.equal(r.body.icon.byteSize, r.body.icon.originalByteSize);
      assert.match(r.body.icon.svg, /Page-1/);
    });

    it("stores only clean markup", async () => {
      const p = await newProject("Clean");
      const evil = SVG('<script>alert(1)</script><image href="https://evil.example/x.png"/><path d="M0 0h8v8z" onclick="x()"/><use href="https://evil.example/s.svg#a"/>', 'onload="x()"');
      const r = await paste(p.id, "Evil", evil);
      assert.equal(r.status, 201);
      assert.doesNotMatch(r.body.icon.svg, /script|evil|onclick|onload|<image/i);
      const stored = await Icon.findById(r.body.icon.id);
      assert.doesNotMatch(stored?.svg ?? "", /script|evil|onclick|onload/i);
    });

    it("rejects markup that is not an SVG, with a 400 and a message", async () => {
      const p = await newProject("Bad");
      for (const rawSvg of ["not svg", "<html></html>", '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>']) {
        const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/paste`, { name: "Bad", rawSvg });
        assert.equal(r.status, 200 === r.status ? r.status : 400);
        assert.ok(r.status === 400, `${rawSvg.slice(0, 20)} -> ${r.status}`);
        assert.equal(typeof r.body.error, "string");
      }
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/paste`, { name: "x" })).status, 400);
      assert.equal((await list(owner.token, p.id)).body.total, 0);
    });

    it("applies the duplicate strategy: rename, replace, skip", async () => {
      const p = await newProject("Strategies");
      const first = await mk(p.id, "Arrow", SVG('<path d="M1 1h9v9z"/>'));

      const renamed = await paste(p.id, "Arrow", SVG('<path d="M2 2h9v9z"/>'));
      assert.equal(renamed.status, 201);
      assert.equal(renamed.body.icon.slug, "arrow-1");
      assert.equal(renamed.body.icon.name, "Arrow (1)");
      const renamed2 = await paste(p.id, "Arrow", SVG('<path d="M3 3h9v9z"/>'));
      assert.equal(renamed2.body.icon.slug, "arrow-2");

      const skipped = await paste(p.id, "Arrow", SVG('<path d="M4 4h9v9z"/>'), { strategy: "skip" });
      assert.deepEqual([skipped.status, skipped.body.outcome], [200, "skipped"]);

      const replaced = await paste(p.id, "Arrow", SVG('<path d="M5 5h9v9z"/>'), { strategy: "replace", tags: ["ignored"] });
      assert.deepEqual([replaced.status, replaced.body.outcome], [200, "replaced"]);
      assert.equal(replaced.body.icon.id, first.id, "the same icon is updated");
      assert.match(replaced.body.icon.svg, /M5 5/);
      const detail = await h.call(owner.token, "GET", `/api/icons/${first.id}`);
      assert.equal(detail.body.versions.length, 1, "the replaced markup is kept as a version");
      assert.equal((await list(owner.token, p.id)).body.total, 3);
    });

    it("puts the icon in a folder of the same project only", async () => {
      const p = await newProject("Folders");
      const other_p = await newProject("Other");
      const f = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "F" })).body;
      const foreign = (await h.call(owner.token, "POST", `/api/projects/${other_p.id}/folders`, { name: "G" })).body;
      assert.equal((await paste(p.id, "In folder", SVG(), { folderId: f.id })).body.icon.folderId, f.id);
      assert.equal((await paste(p.id, "In foreign", SVG(), { folderId: foreign.id })).status, 400);
    });
  });

  describe("upload", () => {
    it("adds several SVG files at once, reporting problems per file", async () => {
      const p = await newProject("Upload");
      const r = await h.call(
        owner.token,
        "POST",
        `/api/projects/${p.id}/icons/upload`,
        form([file("One.svg", SVG('<path d="M1 1h5v5z"/>')), file("Two.svg", SVG('<path d="M2 2h5v5z"/>')), file("notes.txt", "hello", "text/plain"), file("Broken.svg", "<svg><path")], { tags: "UI, Arrow" }),
      );
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.deepEqual(r.body.created.map((i: any) => i.slug).sort(), ["one", "two"]);
      assert.deepEqual(r.body.created[0].tags, ["ui", "arrow"]);
      assert.equal(r.body.created[0].svg, undefined, "the summary does not repeat the markup");
      assert.deepEqual(r.body.errors.map((e: any) => e.file).sort(), ["Broken.svg", "notes.txt"]);
      assert.equal((await list(owner.token, p.id)).body.total, 2);
    });

    it("accepts options as text fields: JSON tags, empty folder, optimize=false", async () => {
      const p = await newProject("Fields");
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([file("Raw.svg", MESSY)], { tags: '["A","b"]', folderId: "", optimize: "false" }));
      assert.equal(r.status, 201);
      assert.deepEqual(r.body.created[0].tags, ["a", "b"]);
      assert.equal(r.body.created[0].byteSize, r.body.created[0].originalByteSize);
      const bad = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([file("x.svg", SVG())], { tags: "[oops" }));
      assert.equal(bad.status, 400);
      const badStrategy = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([file("x.svg", SVG())], { strategy: "merge" }));
      assert.equal(badStrategy.status, 400);
    });

    it("needs at least one file", async () => {
      const p = await newProject("Empty upload");
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([]))).status, 400);
    });

    it("refuses more than 200 files in one request", async () => {
      const p = await newProject("Too many");
      const files = Array.from({ length: 201 }, (_, i) => file(`f${i}.svg`, SVG()));
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form(files))).status, 413);
    });

    it("unpacks a ZIP into folders, ignoring metadata, and reuses folders next time", async () => {
      const p = await newProject("Zip");
      const zip = () =>
        new File(
          [
            zipSync({
              "UI/Arrows/left.svg": strToU8(SVG('<path d="M1 1h4v4z"/>')),
              "UI/right.svg": strToU8(SVG('<path d="M2 2h4v4z"/>')),
              "top.svg": strToU8(SVG('<path d="M3 3h4v4z"/>')),
              "__MACOSX/UI/._right.svg": strToU8("junk"),
              ".hidden/x.svg": strToU8(SVG()),
              "readme.txt": strToU8("hi"),
            }),
          ],
          "icons.zip",
          { type: "application/zip" },
        );
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([zip()]));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.created.length, 3);
      assert.equal(r.body.foldersCreated, 2);
      assert.deepEqual(r.body.errors, []);

      const folders = (await h.call(owner.token, "GET", `/api/projects/${p.id}/folders`)).body;
      const ui = folders.folders.find((f: any) => f.name === "UI");
      const arrows = folders.folders.find((f: any) => f.name === "Arrows");
      assert.equal(arrows.parentId, ui.id);
      assert.equal(arrows.iconCount, 1);
      assert.equal(ui.iconCount, 1);
      assert.equal(folders.uncategorizedCount, 1);

      // Same ZIP again: no duplicate folders, and the strategy decides what happens to the icons.
      const again = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([zip()], { strategy: "skip" }));
      assert.equal(again.body.created.length, 0);
      assert.equal(again.body.skipped.length, 3);
      assert.equal(again.body.foldersCreated, 0, "existing folders are reused");
      assert.equal((await h.call(owner.token, "GET", `/api/projects/${p.id}/folders`)).body.folders.length, 2);
      const replaced = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([zip()], { strategy: "replace" }));
      assert.equal(replaced.body.replaced.length, 3);
    });

    it("recreates a ZIP's folders under a chosen folder", async () => {
      const p = await newProject("Zip under");
      const base = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Base" })).body;
      const zip = new File([zipSync({ "Sub/a.svg": strToU8(SVG()) })], "z.zip", { type: "application/zip" });
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([zip], { folderId: base.id }));
      assert.equal(r.body.created.length, 1);
      const sub = (await h.call(owner.token, "GET", `/api/projects/${p.id}/folders`)).body.folders.find((f: any) => f.name === "Sub");
      assert.equal(sub.parentId, base.id);
    });

    it("reports a broken ZIP without failing the other files", async () => {
      const p = await newProject("Bad zip");
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([file("broken.zip", "not a zip", "application/zip"), file("ok.svg", SVG())]));
      assert.equal(r.body.created.length, 1);
      assert.match(r.body.errors[0].message, /not a valid ZIP/);
    });

    it("uploads to a folder of the same project only", async () => {
      const p = await newProject("Folder check");
      const q = await newProject("Elsewhere");
      const foreign = (await h.call(owner.token, "POST", `/api/projects/${q.id}/folders`, { name: "G" })).body;
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, form([file("a.svg", SVG())], { folderId: foreign.id }));
      assert.equal(r.status, 400);
    });
  });

  describe("editing", () => {
    let p: any;
    before(async () => {
      p = await newProject("Editing", { visibility: "public" });
    });
    const patch = (id: string, body: unknown, token = owner.token) => h.call(token, "PATCH", `/api/icons/${id}`, body);

    it("renames and gives the icon a new id, refusing a clash", async () => {
      const a = await mk(p.id, "Alpha");
      await mk(p.id, "Beta");
      const ok = await patch(a.id, { name: "Gamma Ray" });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.slug, "gamma-ray");
      const clash = await patch(a.id, { name: "beta" });
      assert.equal(clash.status, 409);
      assert.match(clash.body.error, /"beta"/);
      assert.equal((await h.call(owner.token, "GET", `/api/icons/${a.id}`)).body.slug, "gamma-ray", "nothing changed after the refusal");
    });

    it("keeps the id when only capitalisation changes", async () => {
      const a = await mk(p.id, "Delta");
      const r = await patch(a.id, { name: "DELTA" });
      assert.equal(r.body.name, "DELTA");
      assert.equal(r.body.slug, "delta");
    });

    it("updates tags (lower-cased, de-duplicated) and moves to a folder or the root", async () => {
      const a = await mk(p.id, "Tagged");
      const f = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Target" })).body;
      let r = await patch(a.id, { tags: ["One", "one", " TWO "], folderId: f.id });
      assert.deepEqual(r.body.tags, ["one", "two"]);
      assert.equal(r.body.folderId, f.id);
      r = await patch(a.id, { folderId: null });
      assert.equal(r.body.folderId, null);
      const q = await newProject("Foreign");
      const foreign = (await h.call(owner.token, "POST", `/api/projects/${q.id}/folders`, { name: "G" })).body;
      assert.equal((await patch(a.id, { folderId: foreign.id })).status, 400);
    });

    it("sets and clears codepoints, refusing clashes and non-private-use values", async () => {
      const a = await mk(p.id, "Cp one");
      const b = await mk(p.id, "Cp two");
      assert.equal((await patch(a.id, { codepoint: "e010" })).body.codepoint, "E010");
      const clash = await patch(b.id, { codepoint: "E010" });
      assert.equal(clash.status, 409);
      assert.match(clash.body.error, /Cp one/);
      assert.equal((await patch(b.id, { codepoint: "0041" })).status, 400, "a normal letter must never be taken over");
      assert.equal((await patch(b.id, { codepoint: "zzzz" })).status, 400);
      assert.equal((await patch(a.id, { codepoint: null })).body.codepoint, null);
      assert.equal((await patch(b.id, { codepoint: "E010" })).status, 200, "free again once cleared");
    });

    it("changing the SVG saves the old markup as a version; an identical SVG does not", async () => {
      const a = await mk(p.id, "Versioned", SVG('<path d="M1 1h3v3z"/>'));
      const same = await patch(a.id, { rawSvg: a.svg });
      assert.equal(same.status, 200);
      assert.equal((await h.call(owner.token, "GET", `/api/icons/${a.id}`)).body.versions.length, 0);
      const changed = await patch(a.id, { rawSvg: SVG('<path d="M9 9h3v3z"/>', 'stroke="#000"') });
      assert.match(changed.body.svg, /M9 9/);
      assert.equal(changed.body.hasStroke, true, "flags follow the new markup");
      assert.equal((await h.call(owner.token, "GET", `/api/icons/${a.id}`)).body.versions.length, 1);
      assert.equal((await patch(a.id, { rawSvg: "not svg" })).status, 400);
    });

    it("refuses empty or unknown changes and edits to a trashed icon", async () => {
      const a = await mk(p.id, "Strict");
      assert.equal((await patch(a.id, {})).status, 400);
      assert.equal((await patch(a.id, { projectId: String(new mongoose.Types.ObjectId()) })).status, 400);
      await h.call(owner.token, "DELETE", `/api/icons/${a.id}`);
      assert.equal((await patch(a.id, { name: "Late" })).status, 409);
      assert.equal((await h.call(owner.token, "POST", `/api/icons/${a.id}/optimize`)).status, 409);
    });
  });

  describe("optimize", () => {
    it("shrinks an unoptimized icon, saves a version and refreshes size and flags", async () => {
      const p = await newProject("Optimize");
      const icon = await mk(p.id, "Messy", MESSY, { optimize: false });
      const r = await h.call(owner.token, "POST", `/api/icons/${icon.id}/optimize`);
      assert.equal(r.status, 200);
      assert.equal(r.body.changed, true);
      assert.ok(r.body.after < r.body.before);
      assert.ok(r.body.savingsPercent > 10);
      assert.equal(r.body.icon.byteSize, r.body.after);
      assert.equal(r.body.icon.width, 24);
      assert.doesNotMatch(r.body.icon.svg, /\swidth=|\sheight=/, "dimensions are removed; ids are kept on purpose");
      assert.equal((await h.call(owner.token, "GET", `/api/icons/${icon.id}`)).body.versions.length, 1);
      const again = await h.call(owner.token, "POST", `/api/icons/${icon.id}/optimize`);
      assert.equal(again.body.changed, false);
      assert.equal((await h.call(owner.token, "GET", `/api/icons/${icon.id}`)).body.versions.length, 1, "no new version when nothing changed");
    });
  });

  describe("versions", () => {
    it("restore really brings the old content back, and can itself be undone", async () => {
      const p = await newProject("Versions");
      const a = await mk(p.id, "Shape", SVG('<path d="M1 1h4v4z"/>'));
      const first = a.svg;
      await h.call(owner.token, "PATCH", `/api/icons/${a.id}`, { rawSvg: SVG('<path d="M7 7h4v4z"/>') });
      const detail = await h.call(owner.token, "GET", `/api/icons/${a.id}`);
      assert.equal(detail.body.versions.length, 1);
      assert.match(detail.body.svg, /M7 7/);

      const restored = await h.call(owner.token, "POST", `/api/icons/${a.id}/versions/${detail.body.versions[0].id}/restore`);
      assert.equal(restored.status, 200);
      assert.equal(restored.body.svg, first, "the original markup is back");
      assert.equal(restored.body.versions.length, 2, "the markup that was replaced is now a version too");

      const undo = restored.body.versions[0];
      const back = await h.call(owner.token, "POST", `/api/icons/${a.id}/versions/${undo.id}/restore`);
      assert.match(back.body.svg, /M7 7/);
    });

    it("rejects a version of another icon", async () => {
      const p = await newProject("Versions 2");
      const a = await mk(p.id, "A", SVG('<path d="M1 1h4v4z"/>'));
      const b = await mk(p.id, "B", SVG('<path d="M2 2h4v4z"/>'));
      await h.call(owner.token, "PATCH", `/api/icons/${b.id}`, { rawSvg: SVG('<path d="M3 3h4v4z"/>') });
      const bv = (await h.call(owner.token, "GET", `/api/icons/${b.id}`)).body.versions[0];
      assert.equal((await h.call(owner.token, "POST", `/api/icons/${a.id}/versions/${bv.id}/restore`)).status, 404);
      assert.equal((await h.call(owner.token, "POST", `/api/icons/${a.id}/versions/nope/restore`)).status, 400);
    });

    it("keeps only the newest 20 versions", async () => {
      const p = await newProject("Version cap");
      const a = await mk(p.id, "Busy", SVG('<path d="M0 0h1v1z"/>'));
      for (let i = 1; i <= 23; i += 1) {
        await h.call(owner.token, "PATCH", `/api/icons/${a.id}`, { rawSvg: SVG(`<path d="M0 0h${i + 1}v1z"/>`) });
      }
      const versions = (await h.call(owner.token, "GET", `/api/icons/${a.id}/versions`)).body.versions;
      assert.equal(versions.length, 20);
      assert.equal(await IconVersion.countDocuments({ iconId: a.id }), 20);
    });

    it("lets others read versions of a public icon but not restore", async () => {
      const p = await newProject("Versions 3", { visibility: "public" });
      const a = await mk(p.id, "A", SVG('<path d="M1 1h4v4z"/>'));
      await h.call(owner.token, "PATCH", `/api/icons/${a.id}`, { rawSvg: SVG('<path d="M5 5h4v4z"/>') });
      const v = (await h.call(other.token, "GET", `/api/icons/${a.id}/versions`)).body.versions[0];
      assert.ok(v);
      assert.equal((await h.call(other.token, "POST", `/api/icons/${a.id}/versions/${v.id}/restore`)).status, 403);
    });
  });

  describe("trash", () => {
    it("moves to the trash, hides from the normal list, and shows in the trash list", async () => {
      const p = await newProject("Trash");
      const a = await mk(p.id, "Bin me");
      const del = await h.call(owner.token, "DELETE", `/api/icons/${a.id}`);
      assert.equal(del.status, 200);
      assert.ok(del.body.deletedAt);
      assert.equal((await list(owner.token, p.id)).body.total, 0);
      const trash = await list(owner.token, p.id, "?trash=true&sort=deleted");
      assert.deepEqual(trash.body.icons.map((i: any) => i.id), [a.id]);
      assert.equal((await h.call(owner.token, "GET", `/api/icons/${a.id}`)).status, 200, "a trashed icon can still be opened");
      assert.equal((await h.call(owner.token, "GET", `/api/projects/${p.id}`)).body.trashCount, 1);
    });

    it("frees the id while in the trash, and restoring into a taken id gives it a new one", async () => {
      const p = await newProject("Trash ids");
      const old = await mk(p.id, "Home");
      await h.call(owner.token, "DELETE", `/api/icons/${old.id}`);
      const fresh = await paste(p.id, "Home");
      assert.equal(fresh.status, 201);
      assert.equal(fresh.body.icon.slug, "home", "no numbering: the trashed icon does not count");
      const restored = await h.call(owner.token, "POST", `/api/icons/${old.id}/restore`);
      assert.equal(restored.status, 200);
      assert.equal(restored.body.icon.slug, "home-1");
      assert.equal(restored.body.icon.name, "Home (1)");
      assert.equal(restored.body.icon.deletedAt, null);
      assert.match(restored.body.adjusted[0], /id changed/);
    });

    it("clears a codepoint that was taken while the icon was in the trash", async () => {
      const p = await newProject("Trash codepoints");
      const x = await mk(p.id, "X");
      const y = await mk(p.id, "Y");
      await h.call(owner.token, "PATCH", `/api/icons/${x.id}`, { codepoint: "E020" });
      await h.call(owner.token, "DELETE", `/api/icons/${x.id}`);
      assert.equal((await h.call(owner.token, "PATCH", `/api/icons/${y.id}`, { codepoint: "E020" })).status, 200);
      const r = await h.call(owner.token, "POST", `/api/icons/${x.id}/restore`);
      assert.equal(r.body.icon.codepoint, null);
      assert.match(r.body.adjusted.join(" "), /codepoint E020 cleared/);
    });

    it("restoring an icon that is not in the trash changes nothing", async () => {
      const p = await newProject("Trash noop");
      const a = await mk(p.id, "Active");
      const r = await h.call(owner.token, "POST", `/api/icons/${a.id}/restore`);
      assert.deepEqual(r.body.adjusted, []);
      assert.equal(r.body.icon.slug, "active");
    });

    it("deletes permanently only what is already in the trash, with its versions", async () => {
      const p = await newProject("Permanent");
      const a = await mk(p.id, "Gone", SVG('<path d="M1 1h4v4z"/>'));
      await h.call(owner.token, "PATCH", `/api/icons/${a.id}`, { rawSvg: SVG('<path d="M2 2h4v4z"/>') });
      assert.equal((await h.call(owner.token, "DELETE", `/api/icons/${a.id}?permanent=true`)).status, 409);
      await h.call(owner.token, "DELETE", `/api/icons/${a.id}`);
      assert.equal((await h.call(owner.token, "DELETE", `/api/icons/${a.id}?permanent=true`)).status, 200);
      assert.equal((await h.call(owner.token, "GET", `/api/icons/${a.id}`)).status, 404);
      assert.equal(await IconVersion.countDocuments({ iconId: a.id }), 0);
    });

    it("empties only the trash of its own project", async () => {
      const p = await newProject("Empty A");
      const q = await newProject("Empty B");
      const a = await mk(p.id, "A1");
      const b = await mk(q.id, "B1");
      await h.call(owner.token, "DELETE", `/api/icons/${a.id}`);
      await h.call(owner.token, "DELETE", `/api/icons/${b.id}`);
      assert.deepEqual((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/icons/trash`)).body, { deleted: 1 });
      assert.equal(await Icon.countDocuments({ projectId: q.id }), 1, "the other project's trash is untouched");
    });
  });

  describe("batch actions", () => {
    let a: any, b: any, ia: any[], ib: any[], folderA: any, folderB: any;
    before(async () => {
      a = await newProject("Batch A");
      b = await newProject("Batch B");
      folderA = (await h.call(owner.token, "POST", `/api/projects/${a.id}/folders`, { name: "FA" })).body;
      folderB = (await h.call(owner.token, "POST", `/api/projects/${b.id}/folders`, { name: "FB" })).body;
      ia = [await mk(a.id, "A one"), await mk(a.id, "A two"), await mk(a.id, "A three", MESSY, { optimize: false })];
      ib = [await mk(b.id, "B one"), await mk(b.id, "B two", MESSY, { optimize: false })];
    });
    const ids = (icons: any[]) => icons.map((i) => i.id);
    const batch = (projectId: string, action: string, body: unknown, token = owner.token) => h.call(token, "POST", `/api/projects/${projectId}/icons/batch/${action}`, body);
    const state = async (icon: any) => Icon.findById(icon.id).lean();

    it("moves icons into a folder of the same project", async () => {
      const r = await batch(a.id, "move", { iconIds: ids(ia.slice(0, 2)), folderId: folderA.id });
      assert.deepEqual(r.body, { requested: 2, matched: 2 });
      assert.equal(String((await state(ia[0]))?.folderId), folderA.id);
      assert.equal((await batch(a.id, "move", { iconIds: ids(ia), folderId: folderB.id })).status, 400, "a folder of another project is refused");
      assert.equal((await batch(a.id, "move", { iconIds: ids(ia), folderId: null })).body.matched, 3);
    });

    it("tags with add, remove and set", async () => {
      await batch(a.id, "tag", { iconIds: ids(ia), tags: ["X", "y"] });
      assert.deepEqual((await state(ia[0]))?.tags, ["x", "y"]);
      await batch(a.id, "tag", { iconIds: ids(ia), tags: ["y", "z"], mode: "add" });
      assert.deepEqual((await state(ia[0]))?.tags, ["x", "y", "z"], "no duplicates");
      await batch(a.id, "tag", { iconIds: ids(ia), tags: ["x"], mode: "remove" });
      assert.deepEqual((await state(ia[0]))?.tags, ["y", "z"]);
      await batch(a.id, "tag", { iconIds: ids(ia), tags: ["only"], mode: "set" });
      assert.deepEqual((await state(ia[0]))?.tags, ["only"]);
    });

    it("never touches icons that belong to another project (ids are checked against the project in the URL)", async () => {
      const foreign = ids(ib);
      const mixed = [...foreign, ia[0].id];

      assert.deepEqual((await batch(a.id, "tag", { iconIds: foreign, tags: ["hacked"] })).body.matched, 0);
      assert.deepEqual((await batch(a.id, "move", { iconIds: foreign, folderId: folderA.id })).body.matched, 0);
      assert.deepEqual((await batch(a.id, "delete", { iconIds: foreign })).body.matched, 0);
      assert.deepEqual((await batch(a.id, "optimize", { iconIds: foreign })).body.matched, 0);
      assert.equal((await batch(a.id, "delete", { iconIds: mixed })).body.matched, 1, "only the icon of this project is affected");

      for (const icon of ib) {
        const s = await state(icon);
        assert.equal(s?.deletedAt, null, "not trashed");
        assert.equal(s?.folderId, null, "not moved");
        assert.ok(!(s?.tags ?? []).includes("hacked"), "not tagged");
      }
      await batch(a.id, "restore", { iconIds: [ia[0].id] });

      // Permanent deletion and restore are scoped the same way.
      await h.call(owner.token, "DELETE", `/api/icons/${ib[0].id}`);
      assert.equal((await batch(a.id, "delete", { iconIds: [ib[0].id], permanent: true })).body.matched, 0);
      assert.ok(await state(ib[0]), "the other project's trashed icon still exists");
      assert.equal((await batch(a.id, "restore", { iconIds: [ib[0].id] })).body.matched, 0);
      assert.ok((await state(ib[0]))?.deletedAt, "and is still in its trash");
      await h.call(owner.token, "POST", `/api/icons/${ib[0].id}/restore`);
    });

    it("moves to the trash, restores, and permanently deletes only trashed icons", async () => {
      const set = ids(ia.slice(0, 2));
      assert.equal((await batch(a.id, "delete", { iconIds: set })).body.matched, 2);
      assert.equal((await list(owner.token, a.id)).body.total, 1);
      assert.equal((await batch(a.id, "delete", { iconIds: [ia[2].id], permanent: true })).body.matched, 0, "an active icon is not deleted permanently");
      const restored = await batch(a.id, "restore", { iconIds: set });
      assert.equal(restored.body.matched, 2);
      assert.equal((await list(owner.token, a.id)).body.total, 3);
      await batch(a.id, "delete", { iconIds: [ia[0].id] });
      assert.equal((await batch(a.id, "delete", { iconIds: [ia[0].id], permanent: true })).body.matched, 1);
      assert.equal(await state(ia[0]), null);
    });

    it("optimizes several icons and reports the savings", async () => {
      const r = await batch(a.id, "optimize", { iconIds: ids(ia.slice(1)) });
      assert.equal(r.status, 200);
      assert.equal(r.body.matched, 2);
      assert.ok(r.body.optimized >= 1);
      assert.ok(r.body.bytesAfter < r.body.bytesBefore);
      assert.deepEqual(r.body.failed, []);
    });

    it("validates the id list", async () => {
      assert.equal((await batch(a.id, "tag", { iconIds: [], tags: ["x"] })).status, 400);
      assert.equal((await batch(a.id, "delete", { iconIds: ["nope"] })).status, 400);
      assert.equal((await batch(a.id, "delete", { iconIds: Array.from({ length: 501 }, () => String(new mongoose.Types.ObjectId())) })).status, 400);
      assert.equal((await batch(a.id, "tag", { iconIds: [ia[1].id], tags: [] })).status, 400);
    });

    it("needs edit rights", async () => {
      const shared = await newProject("Batch shared", { visibility: "public" });
      const icon = await mk(shared.id, "S1");
      for (const [action, body] of [["move", { iconIds: [icon.id], folderId: null }], ["tag", { iconIds: [icon.id], tags: ["x"] }], ["delete", { iconIds: [icon.id] }], ["restore", { iconIds: [icon.id] }], ["optimize", { iconIds: [icon.id] }]] as const) {
        assert.equal((await batch(shared.id, action, body, other.token)).status, 403, action);
      }
      assert.equal((await batch(priv.id, "delete", { iconIds: [icon.id] }, other.token)).status, 404);
    });
  });

  describe("copy between projects", () => {
    it("lets another user copy icons out of a public project into their own", async () => {
      const src = await newProject("Source", { visibility: "public" });
      const f = (await h.call(owner.token, "POST", `/api/projects/${src.id}/folders`, { name: "Src folder" })).body;
      const i1 = await mk(src.id, "Star", SVG('<path d="M1 1h4v4z"/>'), { tags: ["shape"] });
      const i2 = await mk(src.id, "Moon", SVG('<path d="M2 2h4v4z"/>'));
      await h.call(owner.token, "PATCH", `/api/icons/${i1.id}`, { codepoint: "E030", folderId: f.id });

      const mine = (await h.call(other.token, "POST", "/api/projects", { name: "My own" })).body;
      const dest = (await h.call(other.token, "POST", `/api/projects/${mine.id}/folders`, { name: "Dest" })).body;
      const r = await h.call(other.token, "POST", `/api/projects/${mine.id}/icons/copy`, { sourceProjectId: src.id, iconIds: [i1.id, i2.id], folderId: dest.id });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.deepEqual(r.body.created.map((i: any) => i.slug).sort(), ["moon", "star"]);
      assert.deepEqual(r.body.created.find((i: any) => i.slug === "star").tags, ["shape"]);
      assert.equal(r.body.created[0].folderId, dest.id);
      assert.equal(r.body.created.find((i: any) => i.slug === "star").codepoint, null, "codepoints are not copied");

      assert.equal((await list(owner.token, src.id)).body.total, 2, "the source is unchanged");
      const again = await h.call(other.token, "POST", `/api/projects/${mine.id}/icons/copy`, { sourceProjectId: src.id, iconIds: [i1.id], strategy: "skip" });
      assert.equal(again.body.skipped.length, 1);
    });

    it("refuses a private source, a target the user cannot edit, and ids from another project", async () => {
      const secret = await mk(priv.id, "Hidden");
      const mine = (await h.call(other.token, "POST", "/api/projects", { name: "Mine 2" })).body;
      assert.equal((await h.call(other.token, "POST", `/api/projects/${mine.id}/icons/copy`, { sourceProjectId: priv.id, iconIds: [secret.id] })).status, 404);
      assert.equal((await h.call(other.token, "POST", `/api/projects/${pub.id}/icons/copy`, { sourceProjectId: pub.id, iconIds: [secret.id] })).status, 403);

      const open = await newProject("Open source", { visibility: "public" });
      const wrong = await h.call(other.token, "POST", `/api/projects/${mine.id}/icons/copy`, { sourceProjectId: open.id, iconIds: [secret.id] });
      assert.equal(wrong.status, 200);
      assert.equal(wrong.body.created.length, 0, "an icon of another project is not copied through this source");
      assert.match(wrong.body.errors[0].message, /not found in the source project/);
      assert.equal((await list(other.token, mine.id)).body.total, 0);
    });

    it("does not copy trashed icons", async () => {
      const src = await newProject("Trash source", { visibility: "public" });
      const t = await mk(src.id, "Trashed");
      await h.call(owner.token, "DELETE", `/api/icons/${t.id}`);
      const mine = (await h.call(other.token, "POST", "/api/projects", { name: "Mine 3" })).body;
      const r = await h.call(other.token, "POST", `/api/projects/${mine.id}/icons/copy`, { sourceProjectId: src.id, iconIds: [t.id] });
      assert.equal(r.body.created.length, 0);
    });
  });

  describe("listing", () => {
    let p: any, f: any, sub: any;
    before(async () => {
      p = await newProject("Listing", { visibility: "public" });
      f = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Top" })).body;
      sub = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Sub", parentId: f.id })).body;
      await mk(p.id, "Banana", SVG('<path d="M1 1h4v4z"/>'), { tags: ["fruit"] });
      await mk(p.id, "apple", SVG('<path d="M2 2h4v4z"/>'), { tags: ["fruit", "red"], folderId: f.id });
      await mk(p.id, "Cherry", MESSY, { tags: ["red"], folderId: sub.id, optimize: false });
      await mk(p.id, "a.b dot");
      await mk(p.id, "axb other");
    });
    const names = (r: any) => r.body.icons.map((i: any) => i.name);

    it("returns icons with their markup by default and can leave it out", async () => {
      const r = await list(other.token, p.id);
      assert.equal(r.status, 200);
      assert.match(r.body.icons[0].svg, /^<svg/);
      const light = await list(other.token, p.id, "?svg=false");
      assert.equal(light.body.icons[0].svg, undefined);
    });

    it("filters by folder, subfolders and the project root", async () => {
      assert.deepEqual(names(await list(owner.token, p.id, `?folderId=${f.id}&sort=name`)), ["apple"]);
      assert.deepEqual(names(await list(owner.token, p.id, `?folderId=${f.id}&includeSubfolders=true&sort=name`)), ["apple", "Cherry"]);
      assert.deepEqual(names(await list(owner.token, p.id, "?folderId=root&sort=name")), ["a.b dot", "axb other", "Banana"]);
    });

    it("searches names, slugs and tags without treating text as a pattern", async () => {
      assert.deepEqual(names(await list(owner.token, p.id, "?search=BANAN")), ["Banana"]);
      assert.deepEqual(names(await list(owner.token, p.id, "?search=a.b")), ["a.b dot"]);
      assert.deepEqual(names(await list(owner.token, p.id, "?search=red&sort=name")), ["apple", "Cherry"]);
      assert.deepEqual(names(await list(owner.token, p.id, "?tag=FRUIT&sort=name")), ["apple", "Banana"]);
    });

    it("sorts by name (case-insensitive), size and age", async () => {
      assert.deepEqual(names(await list(owner.token, p.id, "?sort=name")).slice(0, 3), ["a.b dot", "apple", "axb other"]);
      assert.deepEqual(names(await list(owner.token, p.id, "?sort=name-desc")).slice(0, 2), ["Cherry", "Banana"]);
      assert.equal((await list(owner.token, p.id, "?sort=largest")).body.icons[0].name, "Cherry");
      assert.equal((await list(owner.token, p.id, "?sort=oldest")).body.icons[0].name, "Banana");
      assert.equal((await list(owner.token, p.id, "?sort=newest")).body.icons[0].name, "axb other");
    });

    it("pages and reports the total", async () => {
      const r = await list(owner.token, p.id, "?sort=name&limit=2&page=2");
      assert.equal(r.body.total, 5);
      assert.deepEqual(names(r), ["axb other", "Banana"]);
    });

    it("refuses nonsense query values", async () => {
      for (const qs of ["?sort=random", "?limit=0", "?limit=5000", "?folderId=abc", "?trash=maybe"]) {
        assert.equal((await list(owner.token, p.id, qs)).status, 400, qs);
      }
    });
  });

  describe("global search", () => {
    before(async () => {
      const pubS = await newProject("Search public", { visibility: "public" });
      const privS = await newProject("Search private");
      const arch = await newProject("Search archived", { visibility: "public" });
      await mk(pubS.id, "Zebra public");
      await mk(pubS.id, "Zebra trashed").then((i) => h.call(owner.token, "DELETE", `/api/icons/${i.id}`));
      await mk(privS.id, "Zebra private");
      await mk(arch.id, "Zebra archived");
      await h.call(owner.token, "PATCH", `/api/projects/${arch.id}`, { isArchived: true });
      const mine = (await h.call(other.token, "POST", "/api/projects", { name: "Search mine" })).body;
      await mk(mine.id, "Zebra mine").catch(() => null);
      await h.call(other.token, "POST", `/api/projects/${mine.id}/icons/paste`, { name: "Zebra mine", rawSvg: SVG() });
    });
    const search = (token: string, q: string, extra = "") => h.call(token, "GET", `/api/icons/search?q=${encodeURIComponent(q)}${extra}`);

    it("finds own and public icons, not other people's private ones, trashed ones or archived projects", async () => {
      const r = await search(other.token, "zebra");
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.icons.map((i: any) => i.name).sort(), ["Zebra mine", "Zebra public"]);
      assert.equal(r.body.icons[0].project.name.startsWith("Search"), true);
      assert.ok(r.body.icons[0].svg);
    });

    it("lets an admin find private projects too, but still not archived or trashed", async () => {
      const r = await search(admin.token, "zebra");
      assert.deepEqual(r.body.icons.map((i: any) => i.name).sort(), ["Zebra mine", "Zebra private", "Zebra public"]);
    });

    it("escapes the search text and validates the query", async () => {
      assert.equal((await search(other.token, "z.bra")).body.total, 0);
      assert.equal((await h.call(other.token, "GET", "/api/icons/search")).status, 400);
      assert.equal((await h.call(other.token, "GET", "/api/icons/search?q=")).status, 400);
      assert.equal((await search(other.token, "zebra", "&limit=1")).body.icons.length, 1);
      assert.equal((await search(other.token, "zebra", "&limit=1")).body.total, 2);
    });
  });

  describe("downloads", () => {
    let p: any, one: any, two: any;
    before(async () => {
      p = await newProject("Downloads", { visibility: "public" });
      one = await mk(p.id, "Down one", SVG('<path d="M1 1h4v4z"/>'));
      two = await mk(p.id, "Down two", SVG('<path d="M2 2h4v4z"/>'));
    });

    it("downloads one icon as an attachment with safe headers", async () => {
      const r = await h.call(other.token, "GET", `/api/icons/${one.id}/download`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("content-type"), "image/svg+xml");
      assert.match(r.headers.get("content-disposition") ?? "", /^attachment; filename="down-one\.svg"$/);
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
      assert.match(r.headers.get("content-security-policy") ?? "", /sandbox/);
      assert.match(String(r.body), /^<svg/);
    });

    it("downloads one selected icon as an SVG and several as a ZIP", async () => {
      const single = await h.call(other.token, "POST", `/api/projects/${p.id}/icons/download`, { iconIds: [one.id] });
      assert.equal(single.headers.get("content-type"), "image/svg+xml");
      const many = await h.call(other.token, "POST", `/api/projects/${p.id}/icons/download`, { iconIds: [one.id, two.id] });
      assert.equal(many.headers.get("content-type"), "application/zip");
      assert.match(many.headers.get("content-disposition") ?? "", /icons\.zip/);
      const files = unzipSync(new Uint8Array(await many.raw.arrayBuffer()));
      assert.deepEqual(Object.keys(files).sort(), ["down-one.svg", "down-two.svg"]);
      assert.match(Buffer.from(files["down-two.svg"] as Uint8Array).toString(), /M2 2/);
    });

    it("only includes icons of the project in the URL", async () => {
      const q = await newProject("Downloads 2");
      const foreign = await mk(q.id, "Foreign");
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/download`, { iconIds: [foreign.id] })).status, 404);
      const mixed = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/download`, { iconIds: [foreign.id, one.id] });
      assert.equal(mixed.headers.get("content-type"), "image/svg+xml", "only the icon of this project is returned");
    });

    it("skips trashed icons and rejects a bad request", async () => {
      const t = await mk(p.id, "Down trashed");
      await h.call(owner.token, "DELETE", `/api/icons/${t.id}`);
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/download`, { iconIds: [t.id] })).status, 404);
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/download`, { iconIds: [] })).status, 400);
    });

    it("hides a private project's downloads", async () => {
      const secret = await mk(priv.id, "Down secret");
      assert.equal((await h.call(other.token, "POST", `/api/projects/${priv.id}/icons/download`, { iconIds: [secret.id] })).status, 404);
    });
  });
});
