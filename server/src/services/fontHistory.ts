// The font build history: the ZIPs editors downloaded, each with a version number (v1, v2, ... per project, never reused), newest first, at most MAX_STORED_BUILDS per project (older ones are dropped as new ones arrive). Viewers of a project can list and download them; editors can delete them.
import mongoose, { type Types } from "mongoose";
import { NotFoundError } from "../lib/errors.js";
import Project from "../models/Project.js";
import FontBuild, { MAX_STORED_BUILDS, MAX_STORED_BUILD_BYTES } from "../models/FontBuild.js";

type Id = Types.ObjectId;

export type FontBuildSummary = { id: string; version: number; fontName: string; iconCount: number; formats: string[]; size: number; createdAt: Date };

// Packages kept before version numbers existed have none: number them oldest first, after any numbers already handed out.
async function ensureVersions(projectId: Id): Promise<void> {
  const missing = await FontBuild.find({ projectId, version: { $exists: false } }, { _id: 1 }).sort({ createdAt: 1, _id: 1 }).lean();
  if (missing.length === 0) return;
  const [project, newest] = await Promise.all([Project.findById(projectId, { fontBuildCount: 1 }).lean(), FontBuild.findOne({ projectId, version: { $exists: true } }, { version: 1 }).sort({ version: -1 }).lean()]);
  let next = Math.max(project?.fontBuildCount ?? 0, newest?.version ?? 0);
  for (const row of missing) {
    next += 1;
    await FontBuild.collection.updateOne({ _id: row._id, version: { $exists: false } }, { $set: { version: next } });
  }
  await Project.updateOne({ _id: projectId, fontBuildCount: { $lt: next } }, { $set: { fontBuildCount: next } });
}

// Keeps a downloaded package. Skips ones too large to store; the download itself is not affected.
export async function recordFontBuild(projectId: Id, userId: string, build: { fontName: string; iconCount: number }, formats: string[], zip: Buffer): Promise<boolean> {
  if (zip.length > MAX_STORED_BUILD_BYTES) return false;
  await ensureVersions(projectId);
  // The next version number for this project, taken atomically so two downloads at once cannot share one.
  const counted = await Project.findOneAndUpdate({ _id: projectId }, { $inc: { fontBuildCount: 1 } }, { returnDocument: "after", projection: { fontBuildCount: 1 } });
  if (!counted) return false;
  await FontBuild.create({ projectId, version: counted.fontBuildCount, createdBy: new mongoose.Types.ObjectId(userId), fontName: build.fontName, iconCount: build.iconCount, formats, size: zip.length, zip });
  const extra = await FontBuild.find({ projectId }, { _id: 1 }).sort({ createdAt: -1, _id: -1 }).skip(MAX_STORED_BUILDS).lean();
  if (extra.length > 0) await FontBuild.deleteMany({ _id: { $in: extra.map((row) => row._id) } });
  return true;
}

export async function listFontBuilds(projectId: Id): Promise<FontBuildSummary[]> {
  await ensureVersions(projectId);
  const rows = await FontBuild.find({ projectId }, { zip: 0 }).sort({ createdAt: -1, _id: -1 }).lean();
  return rows.map((row) => ({ id: String(row._id), version: row.version, fontName: row.fontName, iconCount: row.iconCount, formats: row.formats ?? [], size: row.size, createdAt: row.createdAt as Date }));
}

async function findBuild(projectId: Id, buildId: string, withZip: boolean) {
  if (!mongoose.isValidObjectId(buildId)) throw new NotFoundError("Build not found");
  const row = await FontBuild.findOne({ _id: buildId, projectId }, withZip ? {} : { zip: 0 });
  if (!row) throw new NotFoundError("Build not found");
  return row;
}

export async function getFontBuildZip(projectId: Id, buildId: string) {
  const row = await findBuild(projectId, buildId, true);
  return { filename: `${row.fontName}-font-v${row.version}.zip`, zip: Buffer.from(row.zip) };
}

export async function deleteFontBuild(projectId: Id, buildId: string): Promise<void> {
  const row = await findBuild(projectId, buildId, false);
  await FontBuild.deleteOne({ _id: row._id });
}

export async function deleteFontBuilds(projectId: Id): Promise<void> {
  await FontBuild.deleteMany({ projectId });
}
