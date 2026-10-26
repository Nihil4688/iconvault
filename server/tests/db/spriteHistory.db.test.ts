// HTTP tests for the sprite build history: sending a ZIP built in the browser, listing, downloading again, deleting, version numbers, the 20 build limit, access rules and bad uploads.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import SpriteBuild from "../../src/models/SpriteBuild.js";
import { hasDatabase, startHarness, type TestUser } from "./harness.js";

const zipOf = (name: string) => Buffer.from(zipSync({ "sprite.svg": strToU8(`<svg>${name}</svg>`), "demo.html": strToU8("<p>demo</p>") }));

describe("sprite build history (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;
  let other: TestUser;

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("owner");
    other = await h.makeUser("other");
  });
  after(() => h?.stop());

  const makeProject = async (visibility = "private") => (await h.call(owner.token, "POST", "/api/projects", { name: "Sprites", prefix: "spr", purpose: "sprite", visibility })).body;
  const send = (token: string, projectId: string, zip: Buffer | null, fields: Record<string, string> = {}) => {
    const fd = new FormData();
    if (zip) fd.append("bundle", new Blob([new Uint8Array(zip)], { type: "application/zip" }), "bundle.zip");
    for (const [k, v] of Object.entries({ mode: "symbol", iconCount: "3", ...fields })) fd.append(k, v);
    return h.call(token, "POST", `/api/projects/${projectId}/sprite/builds`, fd);
  };
  const builds = (token: string, projectId: string) => h.call(token, "GET", `/api/projects/${projectId}/sprite/builds`);

  it("keeps a sent ZIP, lists it with its version, and serves the same bytes again", async () => {
    const p = await makeProject();
    assert.deepEqual((await builds(owner.token, p.id)).body.builds, []);
    const first = zipOf("one");
    const created = await send(owner.token, p.id, first, { mode: "stack", iconCount: "5" });
    assert.equal(created.status, 201);
    assert.equal(created.body.version, 1);
    await send(owner.token, p.id, zipOf("two"));
    const list = (await builds(owner.token, p.id)).body.builds;
    assert.deepEqual(list.map((b: any) => [b.version, b.mode, b.iconCount]), [[2, "symbol", 3], [1, "stack", 5]]);
    assert.equal(list[1].size, first.length);
    assert.equal("zip" in list[0], false);
    const again = await h.call(owner.token, "GET", `/api/projects/${p.id}/sprite/builds/${list[1].id}/download`);
    assert.equal(again.status, 200);
    assert.match(again.headers.get("content-disposition") ?? "", /spr-sprite-v1\.zip/);
    const files = unzipSync(new Uint8Array(await again.raw.arrayBuffer()));
    assert.ok("sprite.svg" in files);
  });

  it("only lets editors send and delete, while viewers of a public project can list and download", async () => {
    const p = await makeProject("public");
    assert.equal((await send(other.token, p.id, zipOf("x"))).status, 403);
    await send(owner.token, p.id, zipOf("kept"));
    const list = await builds(other.token, p.id);
    assert.equal(list.body.builds.length, 1);
    assert.equal((await h.call(other.token, "GET", `/api/projects/${p.id}/sprite/builds/${list.body.builds[0].id}/download`)).status, 200);
    assert.equal((await h.call(other.token, "DELETE", `/api/projects/${p.id}/sprite/builds/${list.body.builds[0].id}`)).status, 403);
  });

  it("hides a private project's history from others and needs sign-in", async () => {
    const p = await makeProject();
    await send(owner.token, p.id, zipOf("secret"));
    assert.equal((await builds(other.token, p.id)).status, 404);
    assert.equal((await h.call(null, "GET", `/api/projects/${p.id}/sprite/builds`)).status, 401);
  });

  it("refuses things that are not a ZIP, a missing file, bad fields and an empty file", async () => {
    const p = await makeProject();
    assert.equal((await send(owner.token, p.id, Buffer.from("not a zip at all"))).status, 400);
    assert.equal((await send(owner.token, p.id, null)).status, 400);
    assert.equal((await send(owner.token, p.id, zipOf("x"), { mode: "weird" })).status, 400);
    assert.equal((await send(owner.token, p.id, zipOf("x"), { iconCount: "-1" })).status, 400);
    assert.deepEqual((await builds(owner.token, p.id)).body.builds, []);
  });

  it("deletes a build, never reuses a version, keeps builds apart per project and numbers them on their own", async () => {
    const p = await makeProject();
    const q = await makeProject();
    await send(owner.token, p.id, zipOf("a"));
    await send(owner.token, p.id, zipOf("b"));
    await send(owner.token, q.id, zipOf("other project"));
    const [newest] = (await builds(owner.token, p.id)).body.builds;
    assert.equal(newest.version, 2);
    const elsewhere = (await builds(owner.token, q.id)).body.builds[0].id;
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/sprite/builds/${elsewhere}`)).status, 404);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/sprite/builds/nope`)).status, 404);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}/sprite/builds/${newest.id}`)).status, 200);
    await send(owner.token, p.id, zipOf("c"));
    assert.deepEqual((await builds(owner.token, p.id)).body.builds.map((b: any) => b.version), [3, 1]);
    assert.deepEqual((await builds(owner.token, q.id)).body.builds.map((b: any) => b.version), [1]);
  });

  it("keeps at most 20 builds, dropping the oldest, and removes them with the project", async () => {
    const p = await makeProject();
    for (let i = 0; i < 22; i += 1) assert.equal((await send(owner.token, p.id, zipOf(String(i)))).status, 201);
    const list = (await builds(owner.token, p.id)).body.builds;
    assert.equal(list.length, 20);
    assert.equal(list[0].version, 22);
    assert.equal(list[19].version, 3);
    assert.equal(await SpriteBuild.countDocuments({ projectId: p.id }), 20);
    assert.equal((await h.call(owner.token, "DELETE", `/api/projects/${p.id}`)).status, 200);
    assert.equal(await SpriteBuild.countDocuments({ projectId: p.id }), 0);
  });
});
