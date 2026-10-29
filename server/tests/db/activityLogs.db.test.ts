import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { SVG, hasDatabase, startHarness, type TestUser } from "./harness.js";

describe("activity logs (HTTP, throwaway database)", { skip: hasDatabase ? false : "MONGODB_URI is not set" }, () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let owner: TestUser;

  before(async () => {
    h = await startHarness();
    owner = await h.makeUser("activity-owner");
  });
  after(() => h?.stop());

  it("records project and icon changes with readable snapshots and structured change details", async () => {
    const projectReply = await h.call(owner.token, "POST", "/api/projects", { name: "Activity project" });
    assert.equal(projectReply.status, 201);
    const projectId = new mongoose.Types.ObjectId(projectReply.body.id);
    const collection = mongoose.connection.collection("activitylogs");

    const projectCreated = await collection.findOne({ projectId, actionDone: "create", entityType: "project" });
    assert.ok(projectCreated);
    assert.equal(projectCreated.performedBy, "activity-owner");
    assert.equal(projectCreated.owner, "activity-owner");
    assert.equal(projectCreated.entityName, "Activity project");
    assert.match(projectCreated.actionSummary, /Created project "Activity project"/);
    assert.ok(projectCreated.timestamp instanceof Date);

    const form = new FormData();
    form.append("files", new File([SVG()], "upload.svg", { type: "image/svg+xml" }));
    const uploaded = await h.call(owner.token, "POST", `/api/projects/${projectReply.body.id}/icons/upload`, form);
    assert.equal(uploaded.status, 201);
    const uploadLog = await collection.findOne({ projectId, actionDone: "upload", entityType: "icon" });
    assert.ok(uploadLog);
    assert.match(uploadLog.actionSummary, /Uploaded 1 icon to project "Activity project"/);
    assert.deepEqual(uploadLog.details.fileNames, ["upload.svg"]);

    const iconReply = await h.call(owner.token, "POST", `/api/projects/${projectReply.body.id}/icons/paste`, {
      name: "Home",
      rawSvg: SVG(),
    });
    assert.equal(iconReply.status, 201);
    const iconId = new mongoose.Types.ObjectId(iconReply.body.icon.id);

    await h.call(owner.token, "PATCH", `/api/icons/${iconReply.body.icon.id}`, { name: "Home Filled" });
    const iconUpdated = await collection.findOne({ entityId: iconId, actionDone: "update" });
    assert.ok(iconUpdated);
    assert.equal(iconUpdated.projectId.toString(), projectId.toString());
    assert.equal(iconUpdated.entityName, "Home Filled");
    assert.equal(iconUpdated.changes.name.before, "Home");
    assert.equal(iconUpdated.changes.name.after, "Home Filled");
    assert.equal("svg" in iconUpdated.details, false);
  });

  it("records sprite builds with build metadata and does not expose ZIP contents", async () => {
    const projectReply = await h.call(owner.token, "POST", "/api/projects", { name: "Sprite activity" });
    const projectId = new mongoose.Types.ObjectId(projectReply.body.id);

    // The Sprite Builder produces the sprite in the browser and posts the build facts (this works for public projects too).
    const logReply = await h.call(owner.token, "POST", `/api/projects/${projectReply.body.id}/sprite/builds/log`, { mode: "symbol", iconCount: 3, scope: "all" });
    assert.equal(logReply.status, 200, JSON.stringify(logReply.body));

    const build = await mongoose.connection.collection("activitylogs").findOne({
      projectId,
      actionDone: "build",
      buildType: "sprite",
    });
    assert.ok(build);
    assert.match(build.actionSummary, /Built sprite for project "Sprite activity"/);
    assert.equal(build.details.iconCount, 3);
    assert.equal(build.result, "success");
  });

  it("logs a sprite build exactly once per request: no duplicate entries for the same build", async () => {
    const projectReply = await h.call(owner.token, "POST", "/api/projects", { name: "Sprite once" });
    const projectId = new mongoose.Types.ObjectId(projectReply.body.id);
    const collection = mongoose.connection.collection("activitylogs");

    const logReply = await h.call(owner.token, "POST", `/api/projects/${projectReply.body.id}/sprite/builds/log`, { mode: "symbol", iconCount: 2, scope: "all" });
    assert.equal(logReply.status, 200);
    const builds = await collection.find({ projectId, actionDone: "build", buildType: "sprite" }).toArray();
    assert.equal(builds.length, 1);
  });

  it("records a sprite build for a public project performed by its owner", async () => {
    const projectReply = await h.call(owner.token, "POST", "/api/projects", { name: "Public sprite", visibility: "public" });
    assert.equal(projectReply.status, 201);
    const projectId = new mongoose.Types.ObjectId(projectReply.body.id);
    const collection = mongoose.connection.collection("activitylogs");

    const logReply = await h.call(owner.token, "POST", `/api/projects/${projectReply.body.id}/sprite/builds/log`, { mode: "symbol", iconCount: 1, scope: "all" });
    assert.equal(logReply.status, 200, JSON.stringify(logReply.body));
    const build = await collection.findOne({ projectId, actionDone: "build", buildType: "sprite" });
    assert.ok(build, "the public project's sprite build was recorded");
    assert.equal(build.details.iconCount, 1);
    assert.equal(build.performedBy, "activity-owner");
  });

  it("keeps the server-side sprite endpoint free of activity logging (no double build entries)", async () => {
    const projectReply = await h.call(owner.token, "POST", "/api/projects", { name: "CLI sprite" });
    const projectId = new mongoose.Types.ObjectId(projectReply.body.id);
    const collection = mongoose.connection.collection("activitylogs");

    const spriteReply = await h.call(owner.token, "GET", `/api/projects/${projectReply.body.id}/sprite`);
    assert.equal(spriteReply.status, 200);
    const builds = await collection.find({ projectId, actionDone: "build", buildType: "sprite" }).toArray();
    assert.equal(builds.length, 0);
  });

  it("records font builds and trash clearing with their affected entities", async () => {
    const projectReply = await h.call(owner.token, "POST", "/api/projects", { name: "Font activity", purpose: "font" });
    const pasted = await h.call(owner.token, "POST", `/api/projects/${projectReply.body.id}/icons/paste`, {
      name: "Glyph",
      rawSvg: SVG(),
    });
    assert.equal(pasted.status, 201);

    const fontBuild = await h.call(owner.token, "POST", `/api/projects/${projectReply.body.id}/font/build`, {
      formats: ["ttf"],
      fontName: "ActivityFont",
    });
    assert.equal(fontBuild.status, 200, JSON.stringify(fontBuild.body));

    const projectId = new mongoose.Types.ObjectId(projectReply.body.id);
    const collection = mongoose.connection.collection("activitylogs");
    const fontLog = await collection.findOne({ projectId, actionDone: "build", buildType: "font" });
    assert.ok(fontLog);
    assert.match(fontLog.actionSummary, /Built font for project "Font activity"/);
    assert.equal(fontLog.details.fontName, "ActivityFont");
    assert.equal(fontLog.details.iconCount, 1);

    const trashed = await h.call(owner.token, "DELETE", `/api/icons/${pasted.body.icon.id}`);
    assert.equal(trashed.status, 200);
    const cleared = await h.call(owner.token, "DELETE", `/api/projects/${projectReply.body.id}/icons/trash`);
    assert.deepEqual(cleared.body, { deleted: 1 });
    const clearLog = await collection.findOne({ projectId, actionDone: "clear" });
    assert.ok(clearLog);
    assert.match(clearLog.actionSummary, /Cleared 1 icon from trash in project "Font activity"/);
    assert.equal(clearLog.affectedEntityIds[0].toString(), pasted.body.icon.id);
  });

  it("does not create a success log when an action is rejected", async () => {
    const projectReply = await h.call(owner.token, "POST", "/api/projects", { name: "Rejected activity" });
    const projectId = new mongoose.Types.ObjectId(projectReply.body.id);
    const collection = mongoose.connection.collection("activitylogs");
    const before = await collection.countDocuments({ projectId });

    const rejected = await h.call(owner.token, "PATCH", `/api/projects/${projectReply.body.id}`, { purpose: "not-supported" });
    assert.equal(rejected.status, 400);
    assert.equal(await collection.countDocuments({ projectId }), before);
  });

  it("records project edits, duplication, folder changes, and project deletion", async () => {
    const created = await h.call(owner.token, "POST", "/api/projects", { name: "Original project" });
    const projectId = new mongoose.Types.ObjectId(created.body.id);
    const collection = mongoose.connection.collection("activitylogs");

    const updated = await h.call(owner.token, "PATCH", `/api/projects/${created.body.id}`, { name: "Renamed project" });
    assert.equal(updated.status, 200);
    const updateLog = await collection.findOne({ projectId, actionDone: "update", entityType: "project" });
    assert.ok(updateLog);
    assert.equal(updateLog.changes.name.before, "Original project");
    assert.equal(updateLog.changes.name.after, "Renamed project");
    assert.match(updateLog.actionSummary, /changed name/);

    const folderReply = await h.call(owner.token, "POST", `/api/projects/${created.body.id}/folders`, { name: "Assets" });
    assert.equal(folderReply.status, 201);
    const folderId = new mongoose.Types.ObjectId(folderReply.body.id);
    const renamedFolder = await h.call(owner.token, "PATCH", `/api/folders/${folderReply.body.id}`, { name: "Artwork" });
    assert.equal(renamedFolder.status, 200);
    const folderUpdate = await collection.findOne({ entityId: folderId, actionDone: "update" });
    assert.ok(folderUpdate);
    assert.equal(folderUpdate.changes.name.before, "Assets");
    assert.equal(folderUpdate.changes.name.after, "Artwork");

    const duplicate = await h.call(owner.token, "POST", `/api/projects/${created.body.id}/duplicate`);
    assert.equal(duplicate.status, 201);
    const duplicateLog = await collection.findOne({
      projectId: new mongoose.Types.ObjectId(duplicate.body.id),
      actionDone: "duplicate",
    });
    assert.ok(duplicateLog);
    assert.match(duplicateLog.actionSummary, /Renamed project/);

    const deleted = await h.call(owner.token, "DELETE", `/api/projects/${duplicate.body.id}`);
    assert.equal(deleted.status, 200);
    const deletionLog = await collection.findOne({
      projectId: new mongoose.Types.ObjectId(duplicate.body.id),
      actionDone: "delete",
      entityType: "project",
    });
    assert.ok(deletionLog);
    assert.equal(deletionLog.details.deletedFolders, 1);
  });

  it("records admin transfers and retains the deleted owner's display name", async () => {
    const admin = await h.makeUser("activity-admin", { admin: true });
    const project = await h.call(owner.token, "POST", "/api/projects", { name: "Transferred project" });
    const transferred = await h.call(admin.token, "POST", `/api/admin/projects/${project.body.id}/transfer`, { userId: admin.id });
    assert.equal(transferred.status, 200);

    const collection = mongoose.connection.collection("activitylogs");
    const transferLog = await collection.findOne({
      projectId: new mongoose.Types.ObjectId(project.body.id),
      actionDone: "transfer",
    });
    assert.ok(transferLog);
    assert.equal(transferLog.performedBy, "activity-admin");
    assert.equal(transferLog.owner, "activity-admin");
    assert.match(transferLog.actionSummary, /Transferred project "Transferred project" to "activity-admin"/);

    const formerOwner = await h.makeUser("former-owner");
    const ownedProject = await h.call(formerOwner.token, "POST", "/api/projects", { name: "Deleted with owner" });
    const deleted = await h.call(admin.token, "DELETE", `/api/admin/users/${formerOwner.id}`);
    assert.equal(deleted.status, 200);
    const deletionLog = await collection.findOne({
      projectId: new mongoose.Types.ObjectId(ownedProject.body.id),
      actionDone: "delete",
    });
    assert.ok(deletionLog);
    assert.equal(deletionLog.owner, "former-owner");
  });
});
