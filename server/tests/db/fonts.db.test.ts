// HTTP tests for icon fonts against a throwaway database: building (stable codepoints, scopes, options, warnings, permissions), the ZIP download, importing a font (dry run, names and codepoints, clashes, folders, permissions, bad files) and a full round trip from one project to another.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { unzipSync } from "fflate";
import opentype from "opentype.js";
import Icon from "../../src/models/Icon.js";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

const STAR = '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>';
const BOX = '<path d="M3 3h18v18H3z"/>';
const CIRCLE = '<circle cx="12" cy="12" r="9"/>';

describe("icon fonts (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;
  let other: TestUser;

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("owner");
    other = await h.makeUser("other");
  });
  after(() => h?.stop());

  const makeProject = async (token: string, body: Record<string, unknown> = {}) => (await h.call(token, "POST", "/api/projects", { name: "Fonty", prefix: "fnt", purpose: "font", ...body })).body;
  const upload = async (token: string, projectId: string, files: Record<string, string>, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [name, inner] of Object.entries(files)) fd.append("files", new Blob([SVG(inner)], { type: "image/svg+xml" }), `${name}.svg`);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const r = await h.call(token, "POST", `/api/projects/${projectId}/icons/upload`, fd);
    assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body));
    return r.body;
  };
  const build = (token: string, projectId: string, body: Record<string, unknown> = {}) => h.call(token, "POST", `/api/projects/${projectId}/font/build`, body);
  const codepointsOf = async (projectId: string) => Object.fromEntries((await Icon.find({ projectId, deletedAt: null }).lean()).map((i) => [i.slug, i.codepoint]));

  describe("building", () => {
    it("needs sign-in and a project you can see", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: STAR });
      assert.equal((await build(null as unknown as string, p.id)).status, 401);
      assert.equal((await build(other.token, p.id)).status, 404);
    });

    it("builds a font with stable codepoints and saves them for the owner", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: STAR, box: BOX, circle: CIRCLE });
      const r = await build(owner.token, p.id);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.iconCount, 3);
      assert.equal(r.body.fontName, "IconFont");
      assert.deepEqual(r.body.codepoints.map((c: { slug: string; codepoint: string; isNew: boolean }) => [c.slug, c.codepoint, c.isNew]), [["box", "E001", true], ["circle", "E002", true], ["star", "E003", true]]);
      assert.match(r.body.css, /@font-face/);
      assert.match(r.body.css, /\.icon-star:before/);
      assert.equal(r.body.codepoints[2].className, "icon-star");
      assert.equal(Buffer.from(r.body.preview.base64, "base64").subarray(0, 4).toString("latin1"), "wOF2");
      assert.deepEqual(Object.keys(r.body.sizes).sort(), ["ttf", "woff", "woff2"]);
      assert.deepEqual(await codepointsOf(p.id), { box: "E001", circle: "E002", star: "E003" });

      const again = await build(owner.token, p.id, { startCodepoint: "E800" });
      assert.deepEqual(again.body.codepoints.map((c: { codepoint: string; isNew: boolean }) => [c.codepoint, c.isNew]), [["E001", false], ["E002", false], ["E003", false]]);
    });

    it("rebases and saves every included icon from the new starting codepoint", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: STAR, box: BOX, circle: CIRCLE });
      await build(owner.token, p.id);

      const rebased = await build(owner.token, p.id, { startCodepoint: "E100", reassignCodepoints: true });
      assert.equal(rebased.status, 200, JSON.stringify(rebased.body));
      assert.deepEqual(rebased.body.codepoints.map((c: { slug: string; codepoint: string; isNew: boolean }) => [c.slug, c.codepoint, c.isNew]), [
        ["box", "E100", true],
        ["circle", "E101", true],
        ["star", "E102", true],
      ]);
      assert.deepEqual(await codepointsOf(p.id), { box: "E100", circle: "E101", star: "E102" });

      const downloaded = await h.call(owner.token, "POST", `/api/projects/${p.id}/font/download`, { startCodepoint: "E100", formats: ["ttf"], fontName: "Rebased" });
      const files = unzipSync(new Uint8Array(await downloaded.raw.arrayBuffer()));
      assert.deepEqual(JSON.parse(Buffer.from(files["library.json"] as Uint8Array).toString("utf8")), { box: 57600, circle: 57601, star: 57602 });
      assert.match(Buffer.from(files["style.css"] as Uint8Array).toString("utf8"), /\\e100/);
    });

    it("gives only the new icon a codepoint when one is added later", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { a: STAR, b: BOX });
      await build(owner.token, p.id);
      await upload(owner.token, p.id, { c: CIRCLE });
      const r = await build(owner.token, p.id);
      assert.deepEqual(r.body.codepoints.map((c: { slug: string; codepoint: string; isNew: boolean }) => [c.slug, c.codepoint, c.isNew]), [["a", "E001", false], ["b", "E002", false], ["c", "E003", true]]);
    });

    it("uses the chosen start, prefix, name and shapes other than paths", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { dot: CIRCLE });
      const r = await build(owner.token, p.id, { startCodepoint: "e100", prefix: "my-", fontName: "My Font!" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.fontName, "MyFont");
      assert.equal(r.body.prefix, "my");
      assert.equal(r.body.codepoints[0].codepoint, "E100");
      assert.match(r.body.css, /\.my-dot:before/);
    });

    it("builds a folder with its subfolders, or only the selected icons", async () => {
      const p = await makeProject(owner.token);
      const ui = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "UI" })).body;
      const sub = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Sub", parentId: ui.id })).body;
      await upload(owner.token, p.id, { root: STAR });
      await upload(owner.token, p.id, { inui: BOX }, { folderId: ui.id });
      await upload(owner.token, p.id, { insub: CIRCLE }, { folderId: sub.id });
      const folder = await build(owner.token, p.id, { scope: "folder", folderId: ui.id });
      assert.deepEqual(folder.body.codepoints.map((c: { slug: string }) => c.slug), ["insub", "inui"]);
      const icons = await Icon.find({ projectId: p.id }).lean();
      const pick = icons.filter((i) => ["root", "inui"].includes(i.slug)).map((i) => String(i._id));
      const selected = await build(owner.token, p.id, { scope: "selected", iconIds: pick });
      assert.deepEqual(selected.body.codepoints.map((c: { slug: string }) => c.slug), ["inui", "root"]);
    });

    it("does not reuse a codepoint held by an icon outside the build", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { a: STAR, b: BOX });
      const a = await Icon.findOne({ projectId: p.id, slug: "a" });
      await h.call(owner.token, "PATCH", `/api/icons/${a?._id}`, { codepoint: "E001" });
      const b = await Icon.findOne({ projectId: p.id, slug: "b" });
      const r = await build(owner.token, p.id, { scope: "selected", iconIds: [String(b?._id)] });
      assert.equal(r.body.codepoints[0].codepoint, "E002");
    });

    it("ignores trashed icons and warns about strokes", async () => {
      const p = await makeProject(owner.token);
      const body = await upload(owner.token, p.id, { fill: BOX, gone: STAR });
      const gone = body.created.find((i: { slug: string }) => i.slug === "gone");
      await h.call(owner.token, "DELETE", `/api/icons/${gone.id}`);
      const fd = new FormData();
      fd.append("files", new Blob([SVG('<path d="M3 12h18" stroke="black" fill="none"/>')], { type: "image/svg+xml" }), "line.svg");
      await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, fd);
      const r = await build(owner.token, p.id);
      assert.deepEqual(r.body.codepoints.map((c: { slug: string }) => c.slug), ["fill", "line"]);
      assert.equal(r.body.warnings.length, 1);
      assert.equal(r.body.warnings[0].icon, "line");
      assert.match(r.body.warnings[0].message, /strokes/);
    });

    it("lets a viewer of a public project build, without changing the project", async () => {
      const p = await makeProject(owner.token, { visibility: "public" });
      await upload(owner.token, p.id, { a: STAR, b: BOX });
      const r = await build(other.token, p.id);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.codepoints.map((c: { codepoint: string }) => c.codepoint), ["E001", "E002"]);
      assert.deepEqual(await codepointsOf(p.id), { a: null, b: null });
    });

    it("rejects bad input and empty selections", async () => {
      const p = await makeProject(owner.token);
      assert.equal((await build(owner.token, p.id)).status, 400, "no icons yet");
      await upload(owner.token, p.id, { a: STAR });
      for (const bad of [{ formats: [] }, { formats: ["pdf"] }, { startCodepoint: "0041" }, { scope: "folder" }, { scope: "selected", iconIds: [] }, { extra: 1 }, { fontHeight: 5 }]) {
        assert.equal((await build(owner.token, p.id, bad)).status, 400, JSON.stringify(bad));
      }
      const gone = await build(owner.token, p.id, { scope: "folder", folderId: "a".repeat(24) });
      assert.equal(gone.status, 400);
    });
  });

  describe("editing a codepoint changes the output", () => {
    const setup = async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: STAR, box: BOX, dot: CIRCLE });
      await build(owner.token, p.id);
      const byslug = async (slug: string) => (await Icon.findOne({ projectId: p.id, slug }))?._id;
      return { p, byslug };
    };
    // The characters the font file itself holds, read back with a font parser.
    const fontMap = async (projectId: string) => {
      const r = await h.call(owner.token, "POST", `/api/projects/${projectId}/font/download`, { formats: ["ttf"], fontName: "Edit" });
      const files = unzipSync(new Uint8Array(await r.raw.arrayBuffer()));
      const ttf = Buffer.from(files["Edit.ttf"] as Uint8Array);
      const font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
      const map: Record<string, string[]> = {};
      for (let i = 0; i < font.glyphs.length; i += 1) {
        const g = font.glyphs.get(i);
        if (g.name && g.name !== ".notdef") map[g.name] = g.unicodes.map((u) => u.toString(16).toUpperCase());
      }
      return { map, json: JSON.parse(Buffer.from(files["Edit.json"] as Uint8Array).toString("utf8")), css: Buffer.from(files["Edit.css"] as Uint8Array).toString("utf8") };
    };

    it("shows up in the build, the CSS, the glyph map and the font file itself", async () => {
      const { p, byslug } = await setup();
      const edit = await h.call(owner.token, "PATCH", `/api/icons/${await byslug("star")}`, { codepoint: "e701" });
      assert.equal(edit.status, 200, JSON.stringify(edit.body));
      assert.equal(edit.body.codepoint, "E701");

      const r = await build(owner.token, p.id);
      assert.deepEqual(r.body.codepoints.map((c: { slug: string; codepoint: string; isNew: boolean }) => [c.slug, c.codepoint, c.isNew]), [["box", "E001", false], ["dot", "E002", false], ["star", "E701", false]]);
      assert.match(r.body.css, /\.icon-star:before\s*\{\s*content: "\\e701"/);

      const out = await fontMap(p.id);
      assert.deepEqual(out.map.star, ["E701"], "the font file must hold the glyph on the edited character");
      assert.deepEqual(out.map.box, ["E001"]);
      assert.equal(out.json.star, 0xe701);
      assert.match(out.css, /\.icon-star:before\s*\{\s*content: "\\e701"/);
    });

    it("moves the glyph off its old character", async () => {
      const { p, byslug } = await setup();
      await h.call(owner.token, "PATCH", `/api/icons/${await byslug("dot")}`, { codepoint: "F000" });
      const out = await fontMap(p.id);
      assert.deepEqual(out.map.dot, ["F000"]);
      assert.equal(Object.values(out.map).flat().includes("E002"), false, "nothing is left on the old character");
    });

    it("refuses a character another icon already has, and leaves the output as it was", async () => {
      const { p, byslug } = await setup();
      const clash = await h.call(owner.token, "PATCH", `/api/icons/${await byslug("star")}`, { codepoint: "E001" });
      assert.equal(clash.status, 409);
      assert.match(clash.body.error, /already used by/);
      const out = await fontMap(p.id);
      assert.deepEqual([out.map.box, out.map.dot, out.map.star], [["E001"], ["E002"], ["E003"]]);
    });

    it("swaps two characters in two steps, and the font follows", async () => {
      const { p, byslug } = await setup();
      const [box, dot] = [await byslug("box"), await byslug("dot")];
      assert.equal((await h.call(owner.token, "PATCH", `/api/icons/${box}`, { codepoint: null })).status, 200);
      assert.equal((await h.call(owner.token, "PATCH", `/api/icons/${dot}`, { codepoint: "E001" })).status, 200);
      assert.equal((await h.call(owner.token, "PATCH", `/api/icons/${box}`, { codepoint: "E002" })).status, 200);
      const out = await fontMap(p.id);
      assert.deepEqual([out.map.box, out.map.dot], [["E002"], ["E001"]]);
    });

    it("clearing a character gives the icon the next free one on the next build", async () => {
      const { p, byslug } = await setup();
      await h.call(owner.token, "PATCH", `/api/icons/${await byslug("box")}`, { codepoint: null });
      const r = await build(owner.token, p.id);
      const box = r.body.codepoints.find((c: { slug: string }) => c.slug === "box");
      assert.deepEqual({ codepoint: box.codepoint, isNew: box.isNew }, { codepoint: "E001", isNew: true });
    });

    it("accepts only four hex digits from E000 to F8FF, because the font cannot hold anything else", async () => {
      const { p, byslug } = await setup();
      const star = await byslug("star");
      for (const bad of ["0041", "DFFF", "F900", "F0001", "100000", "E0", "E7011", "zzzz"]) {
        assert.equal((await h.call(owner.token, "PATCH", `/api/icons/${star}`, { codepoint: bad })).status, 400, bad);
      }
      assert.deepEqual((await build(owner.token, p.id)).body.codepoints.map((c: { codepoint: string }) => c.codepoint), ["E001", "E002", "E003"]);
    });

    it("refuses to build an icon that still has an old out-of-range character, and names it", async () => {
      const { p, byslug } = await setup();
      await Icon.updateOne({ _id: await byslug("star") }, { $set: { codepoint: "F0001" } });
      const r = await build(owner.token, p.id);
      assert.equal(r.status, 400);
      assert.match(r.body.error, /star \(F0001\)/);
      assert.match(r.body.error, /outside E000 to F8FF/);
    });

    it("only editors can change a character", async () => {
      const { p, byslug } = await setup();
      await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, { visibility: "public" });
      assert.equal((await h.call(other.token, "PATCH", `/api/icons/${await byslug("star")}`, { codepoint: "E701" })).status, 403);
    });
  });

  describe("download", () => {
    it("packages the chosen formats with the stylesheet, map and specimen", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: STAR, box: BOX });
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/font/download`, { formats: ["ttf", "woff2"], fontName: "Fnt" });
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type") ?? "", /zip/);
      assert.match(r.headers.get("content-disposition") ?? "", /Fnt-font\.zip/);
      const files = unzipSync(new Uint8Array(await r.raw.arrayBuffer()));
      assert.deepEqual(Object.keys(files).sort(), ["Fnt.css", "Fnt.html", "Fnt.json", "Fnt.scss", "Fnt.ttf", "Fnt.woff2", "README.md"]);
      assert.equal(Buffer.from(files["Fnt.woff2"] as Uint8Array).subarray(0, 4).toString("latin1"), "wOF2");
      assert.deepEqual(JSON.parse(Buffer.from(files["Fnt.json"] as Uint8Array).toString("utf8")), { box: 57345, star: 57346 });
    });

    it("leaves woff2 out of the ZIP when it was not requested, though the preview still has it", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: STAR });
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/font/download`, { formats: ["svg", "eot"], fontName: "Only" });
      const files = unzipSync(new Uint8Array(await r.raw.arrayBuffer()));
      assert.equal("Only.woff2" in files, false);
      assert.ok("Only.svg" in files && "Only.eot" in files);
      const preview = await build(owner.token, p.id, { formats: ["svg"] });
      assert.ok(preview.body.preview.base64.length > 100);
    });

    it("follows the same permissions", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: STAR });
      assert.equal((await h.call(other.token, "POST", `/api/projects/${p.id}/font/download`, {})).status, 404);
      assert.equal((await h.call(null as unknown as string, "POST", `/api/projects/${p.id}/font/download`, {})).status, 401);
    });
  });

  describe("importing a font", () => {
    let fontBytes: Buffer;
    let sourceId: string;

    before(async () => {
      const src = await makeProject(owner.token, { name: "Source" });
      sourceId = src.id;
      await upload(owner.token, src.id, { star: STAR, box: BOX });
      const r = await h.call(owner.token, "POST", `/api/projects/${src.id}/font/download`, { formats: ["ttf", "woff2", "svg"], fontName: "Src" });
      const files = unzipSync(new Uint8Array(await r.raw.arrayBuffer()));
      fontBytes = Buffer.from(files["Src.ttf"] as Uint8Array);
      (fontBytes as Buffer & { woff2?: Buffer; svg?: Buffer }).woff2 = Buffer.from(files["Src.woff2"] as Uint8Array);
      (fontBytes as Buffer & { svg?: Buffer }).svg = Buffer.from(files["Src.svg"] as Uint8Array);
    });

    const importFont = (token: string | null, projectId: string, file: Buffer | null, fields: Record<string, string> = {}, name = "font.ttf", mapping?: string) => {
      const fd = new FormData();
      if (file) fd.append("font", new Blob([file as BlobPart]), name);
      if (mapping !== undefined) fd.append("mapping", new Blob([mapping]), "map.css");
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      return h.call(token as string, "POST", `/api/projects/${projectId}/icons/import-font`, fd);
    };

    it("reports what a font holds without changing anything (dry run)", async () => {
      const p = await makeProject(owner.token);
      const r = await importFont(owner.token, p.id, fontBytes, { dryRun: "true" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual({ dryRun: r.body.dryRun, kind: r.body.kind, total: r.body.total, importable: r.body.importable }, { dryRun: true, kind: "truetype", total: 2, importable: 2 });
      assert.deepEqual(r.body.sample.map((s: { name: string }) => s.name).sort(), ["box", "star"]);
      assert.equal(await Icon.countDocuments({ projectId: p.id }), 0);
    });

    it("turns each glyph into an icon that keeps its codepoint", async () => {
      const p = await makeProject(owner.token);
      const r = await importFont(owner.token, p.id, fontBytes);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.created.length, 2);
      assert.equal(r.body.codepointsKept, 2);
      assert.deepEqual(await codepointsOf(p.id), { box: "E001", star: "E002" });
      const icon = await Icon.findOne({ projectId: p.id, slug: "star" }).lean();
      assert.match(icon?.svg ?? "", /<path[^>]* d="/);
      assert.equal(icon?.hasStroke, false);
    });

    it("reads WOFF2 and SVG fonts too, and names glyphs from a mapping file", async () => {
      const extra = fontBytes as Buffer & { woff2: Buffer; svg: Buffer };
      const p1 = await makeProject(owner.token);
      const woff2 = await importFont(owner.token, p1.id, extra.woff2, {}, "font.woff2");
      assert.equal(woff2.body.created.length, 2);
      const p2 = await makeProject(owner.token);
      const svg = await importFont(owner.token, p2.id, extra.svg, {}, "font.svg");
      assert.equal(svg.body.created.length, 2);
      const p3 = await makeProject(owner.token);
      const named = await importFont(owner.token, p3.id, fontBytes, {}, "font.ttf", '.icon-heart:before { content: "\\e002"; }');
      assert.deepEqual(Object.keys(await codepointsOf(p3.id)).sort(), ["box", "heart"]);
      assert.equal(named.status, 201);
    });

    it("handles names that already exist with the chosen strategy", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { star: CIRCLE });
      const skip = await importFont(owner.token, p.id, fontBytes, { strategy: "skip" });
      assert.deepEqual({ created: skip.body.created.length, skipped: skip.body.skipped.length }, { created: 1, skipped: 1 });
      const q = await makeProject(owner.token);
      await upload(owner.token, q.id, { star: CIRCLE });
      const replace = await importFont(owner.token, q.id, fontBytes, { strategy: "replace" });
      assert.equal(replace.body.replaced.length, 1);
      const r = await makeProject(owner.token);
      await upload(owner.token, r.id, { star: CIRCLE });
      const rename = await importFont(owner.token, r.id, fontBytes, { strategy: "rename" });
      assert.equal(rename.body.created.length, 2);
      assert.ok("star-1" in (await codepointsOf(r.id)));
    });

    it("drops a codepoint that is already used in the project, and says so", async () => {
      const p = await makeProject(owner.token);
      await upload(owner.token, p.id, { mine: CIRCLE });
      const mine = await Icon.findOne({ projectId: p.id, slug: "mine" });
      await h.call(owner.token, "PATCH", `/api/icons/${mine?._id}`, { codepoint: "E001" });
      const r = await importFont(owner.token, p.id, fontBytes);
      assert.deepEqual({ kept: r.body.codepointsKept, dropped: r.body.codepointsDropped }, { kept: 1, dropped: 1 });
    });

    it("puts the icons in the chosen folder", async () => {
      const p = await makeProject(owner.token);
      const folder = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Imported" })).body;
      await importFont(owner.token, p.id, fontBytes, { folderId: folder.id });
      assert.equal(await Icon.countDocuments({ projectId: p.id, folderId: folder.id }), 2);
      const other2 = await makeProject(owner.token);
      assert.equal((await importFont(owner.token, other2.id, fontBytes, { folderId: folder.id })).status, 400);
    });

    it("round trips: a font built from one project imports into another with the same icons and characters", async () => {
      const dest = await makeProject(owner.token, { name: "Destination" });
      await importFont(owner.token, dest.id, fontBytes);
      const rebuilt = await build(owner.token, dest.id);
      assert.deepEqual(rebuilt.body.codepoints.map((c: { slug: string; codepoint: string; isNew: boolean }) => [c.slug, c.codepoint, c.isNew]), [["box", "E001", false], ["star", "E002", false]]);
      const original = await build(owner.token, sourceId);
      assert.deepEqual(rebuilt.body.codepoints.map((c: { slug: string; codepoint: string }) => [c.slug, c.codepoint]), original.body.codepoints.map((c: { slug: string; codepoint: string }) => [c.slug, c.codepoint]));
    });

    it("needs editing rights and a real font", async () => {
      const p = await makeProject(owner.token, { visibility: "public" });
      assert.equal((await importFont(null, p.id, fontBytes)).status, 401);
      assert.equal((await importFont(other.token, p.id, fontBytes)).status, 403);
      const hidden = await makeProject(owner.token);
      assert.equal((await importFont(other.token, hidden.id, fontBytes)).status, 404);
      assert.equal((await importFont(owner.token, p.id, null)).status, 400);
      assert.equal((await importFont(owner.token, p.id, Buffer.from("not a font at all"))).status, 400);
      assert.equal((await importFont(owner.token, p.id, fontBytes, { strategy: "explode" })).status, 400);
    });
  });
});
