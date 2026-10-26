// HTTP tests for the sidebar's Uncategorized menu: renaming the group (a project setting) and sending every icon that is in no folder to the trash.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

describe("uncategorized icons (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;
  let other: TestUser;

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("owner");
    other = await h.makeUser("other");
  });
  after(() => h?.stop());

  const project = async (name: string, visibility = "private") => (await h.call(owner.token, "POST", "/api/projects", { name, visibility })).body;
  const paste = (projectId: string, name: string, over: Record<string, unknown> = {}) => h.call(owner.token, "POST", `/api/projects/${projectId}/icons/paste`, { name, rawSvg: SVG(), ...over });

  it("starts with no custom name, renames, trims, and goes back with an empty name", async () => {
    const p = await project("Names");
    assert.equal(p.uncategorizedName, "");
    const renamed = await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, { uncategorizedName: "  Loose icons  " });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.uncategorizedName, "Loose icons");
    assert.equal((await h.call(owner.token, "GET", `/api/projects/${p.id}`)).body.uncategorizedName, "Loose icons");
    assert.equal((await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, { uncategorizedName: "" })).body.uncategorizedName, "");
  });

  it("refuses names over 40 characters and renaming by someone who does not own the project", async () => {
    const p = await project("Limits", "public");
    assert.equal((await h.call(owner.token, "PATCH", `/api/projects/${p.id}`, { uncategorizedName: "x".repeat(41) })).status, 400);
    assert.equal((await h.call(other.token, "PATCH", `/api/projects/${p.id}`, { uncategorizedName: "Mine" })).status, 403);
  });

  it("sends only the icons in no folder to the trash, and they can be restored", async () => {
    const p = await project("Trashing");
    const folder = (await h.call(owner.token, "POST", `/api/projects/${p.id}/folders`, { name: "Arrows" })).body;
    const loose1 = (await paste(p.id, "Loose one")).body.icon;
    const loose2 = (await paste(p.id, "Loose two")).body.icon;
    const filed = (await paste(p.id, "Filed", { folderId: folder.id })).body.icon;
    const result = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/uncategorized/trash`);
    assert.equal(result.status, 200);
    assert.equal(result.body.matched, 2);
    assert.deepEqual([...result.body.ids].sort(), [loose1.id, loose2.id].sort());
    const active = (await h.call(owner.token, "GET", `/api/projects/${p.id}/icons`)).body;
    assert.deepEqual(active.icons.map((icon: { id: string }) => icon.id), [filed.id]);
    const restored = await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/batch/restore`, { iconIds: result.body.ids });
    assert.equal(restored.body.matched, 2);
    // Nothing left to trash the second time round.
    await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/uncategorized/trash`);
    assert.equal((await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/uncategorized/trash`)).body.matched, 0);
  });

  it("needs edit access and stays inside the project", async () => {
    const p = await project("Guarded", "public");
    const q = await project("Other project");
    const mine = (await paste(q.id, "Keep me")).body.icon;
    await paste(p.id, "Loose");
    assert.equal((await h.call(other.token, "POST", `/api/projects/${p.id}/icons/uncategorized/trash`)).status, 403);
    await h.call(owner.token, "POST", `/api/projects/${p.id}/icons/uncategorized/trash`);
    const keep = (await h.call(owner.token, "GET", `/api/projects/${q.id}/icons`)).body;
    assert.deepEqual(keep.icons.map((icon: { id: string }) => icon.id), [mine.id]);
  });
});
