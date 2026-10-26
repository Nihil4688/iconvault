// HTTP tests for the font build history and the base class option: which downloads are kept, listing, downloading again, deleting, the 20 build limit, access rules, and the stylesheet with a base class.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { unzipSync } from "fflate";
import mongoose from "mongoose";
import FontBuild from "../../src/models/FontBuild.js";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

const STAR = '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>';
const BOX = '<path d="M3 3h18v18H3z"/>';

describe("font build history (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;
  let other: TestUser;

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("owner");
    other = await h.makeUser("other");
  });
  after(() => h?.stop());

  const makeProject = async (visibility = "private") => {
    const p = (await h.call(owner.token, "POST", "/api/projects", { name: "Hist", prefix: "hst", purpose: "font", visibility })).body;
    const fd = new FormData();
    for (const [name, inner] of Object.entries({ star: STAR, box: BOX })) fd.append("files", new Blob([SVG(inner)], { type: "image/svg+xml" }), `${name}.svg`);
    assert.ok((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/upload`, fd)).status < 300);
    return p;
  };
  const download = (token: string, projectId: string, body: Record<string, unknown> = {}) => h.call(token, "POST", `/api/projects/${projectId}/font/download`, { formats: ["ttf"], fontName: "Hist", ...body });
  const builds = (token: string, projectId: string) => h.call(token, "GET", `/api/projects/${projectId}/font/builds`);

  it("keeps an editor's download, lists it newest first and serves the same ZIP again", async () => {
    const p = await makeProject();
    assert.deepEqual((await builds(owner.token, p.id)).body.builds, []);
    const first = await download(owner.token, p.id, { fontName: "First" });
    const firstZip = Buffer.from(await first.raw.arrayBuffer());
    await download(owner.token, p.id, { fontName: "Second", formats: ["woff2", "ttf"] });
    const list = (await builds(owner.token, p.id)).body.builds;
    assert.deepEqual(list.map((b: any) => b.fontName), ["Second", "First"]);
    assert.equal(list[0].iconCount, 2);
    assert.deepEqual(list[0].formats, ["woff2", "ttf"]);
    assert.equal(list[1].size, firstZip.length);
    assert.deepEqual(list.map((b: any) => b.version), [2, 1]);
    assert.equal("zip" in list[0], false);
    const again = await h.call(owner.token, "GET", `/api/projects/${p.id}/font/builds/${list[1].id}/download`);
    assert.equal(again.status, 200);
    assert.match(again.headers.get("content-disposition") ?? "", /First-font-v1\.zip/);
    const files = unzipSync(new Uint8Array(await again.raw.arrayBuffer()));
    assert.ok("First.ttf" in files);
  });

  it("does not keep a viewer's download, but lets a viewer of a public project list and download kept builds", async () => {
    const p = await makeProject("public");
    await download(owner.token, p.id, { fontName: "Mine" });
    const viewerDownload = await download(other.token, p.id, { fontName: "Theirs" });
    assert.equal(viewerDownload.status, 200);
    const list = await builds(other.token, p.id);
    assert.deepEqual(list.body.builds.map((b: any) => b.fontName), ["Mine"]);
    assert.equal((await h.call(other.token, "GET", `/api/projects/${p.id}/font/builds/${list.body.builds[0].id}/download`)).status, 200);
  });

  it("hides a private project's history from others", async () => {
    const p = await makeProject();
    await download(owner.token, p.id);
    const id = (await builds(owner.token, p.id)).body.builds[0].id;
    assert.equal((await builds(other.token, p.id)).status, 404);
    assert.equal((await h.call(other.token, "GET", `/api/projects/${p.id}/font/builds/${id}/download`)).status, 404);
    assert.equal((await h.call(null, "GET", `/api/projects/${p.id}/font/builds`)).status, 401);
  });

  it("deletes a build for editors only, and a build id from another project is not found", async () => {
    const p = await makeProject("public");
    const q = await makeProject();
    await download(owner.token, p.id, { fontName: "Gone" });
    await download(owner.token, q.id, { fontName: "Elsewhere" });
    const id = (await builds(owner.token, p.id)).body.builds[0].id;
    const elsewhere = (await builds(owner.token, q.id)).body.builds[0].id;
    assert.equal((await h.call(other.token, "DELETE", `/api/projects/${p.id}/font/builds/${id}`)).status, 403);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/font/builds/${elsewhere}`)).status, 404);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/font/builds/not-an-id`)).status, 404);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/font/builds/${id}`)).status, 200);
    assert.deepEqual((await builds(owner.token, p.id)).body.builds, []);
    assert.equal((await builds(owner.token, q.id)).body.builds.length, 1);
  });

  it("never reuses a version number, even after the newest build is deleted", async () => {
    const p = await makeProject();
    await download(owner.token, p.id, { fontName: "A" });
    await download(owner.token, p.id, { fontName: "B" });
    const [newest] = (await builds(owner.token, p.id)).body.builds;
    assert.equal(newest.version, 2);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/font/builds/${newest.id}`)).status, 200);
    await download(owner.token, p.id, { fontName: "C" });
    assert.deepEqual((await builds(owner.token, p.id)).body.builds.map((b: any) => [b.fontName, b.version]), [["C", 3], ["A", 1]]);
  });

  it("numbers packages kept before versions existed, oldest first, and carries on after them", async () => {
    const p = await makeProject();
    const base = { projectId: new mongoose.Types.ObjectId(p.id), createdBy: new mongoose.Types.ObjectId(owner.id), fontName: "Legacy", iconCount: 2, formats: ["ttf"], size: 3, zip: Buffer.from("zip") };
    // Written straight to the collection, the way an older version of the app stored them (no version).
    await FontBuild.collection.insertOne({ ...base, fontName: "Legacy one", createdAt: new Date("2026-10-01T10:00:00Z") });
    await FontBuild.collection.insertOne({ ...base, fontName: "Legacy two", createdAt: new Date("2026-10-02T10:00:00Z") });
    assert.deepEqual((await builds(owner.token, p.id)).body.builds.map((b: any) => [b.fontName, b.version]), [["Legacy two", 2], ["Legacy one", 1]]);
    await download(owner.token, p.id, { fontName: "New" });
    assert.deepEqual((await builds(owner.token, p.id)).body.builds.map((b: any) => b.version), [3, 2, 1]);
  });

  it("numbers each project on its own", async () => {
    const p = await makeProject();
    const q = await makeProject();
    await download(owner.token, p.id);
    await download(owner.token, p.id);
    await download(owner.token, q.id);
    assert.deepEqual((await builds(owner.token, q.id)).body.builds.map((b: any) => b.version), [1]);
  });

  it("keeps at most 20 builds, dropping the oldest, and removes them with the project", async () => {
    const p = await makeProject();
    for (let i = 0; i < 22; i += 1) await download(owner.token, p.id, { fontName: `B${i}` });
    const list = (await builds(owner.token, p.id)).body.builds;
    assert.equal(list.length, 20);
    assert.equal(list[0].fontName, "B21");
    assert.equal(list[19].fontName, "B2");
    // Versions keep counting: the dropped builds were v1 and v2.
    assert.equal(list[0].version, 22);
    assert.equal(list[19].version, 3);
    assert.equal(await FontBuild.countDocuments({ projectId: p.id }), 20);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}`)).status, 200);
    assert.equal(await FontBuild.countDocuments({ projectId: p.id }), 0);
  });

  describe("base class", () => {
    it("makes the stylesheet need class=\"base prefix-name\", and says so in the README and the build result", async () => {
      const p = await makeProject();
      const r = await h.call(owner.token, "POST", `/api/projects/${p.id}/font/build`, { formats: ["ttf"], fontName: "Base", baseClass: "hst" });
      assert.equal(r.status, 200);
      assert.equal(r.body.baseClass, "hst");
      assert.match(r.body.css, /\.hst:before/);
      assert.match(r.body.css, /\.hst\.icon-star:before/);
      const files = unzipSync(new Uint8Array(await (await download(owner.token, p.id, { fontName: "Base", baseClass: "hst" })).raw.arrayBuffer()));
      assert.match(Buffer.from(files["README.md"] as Uint8Array).toString("utf8"), /class="hst icon-/);
    });

    it("keeps the attribute-selector stylesheet when no base class is given, and refuses a bad one", async () => {
      const p = await makeProject();
      const plain = await h.call(owner.token, "POST", `/api/projects/${p.id}/font/build`, { formats: ["ttf"] });
      assert.equal(plain.body.baseClass, "");
      assert.match(plain.body.css, /\[class\^=/);
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/font/build`, { baseClass: "9bad" })).status, 400);
      assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/font/build`, { baseClass: "has space" })).status, 400);
    });
  });
});
