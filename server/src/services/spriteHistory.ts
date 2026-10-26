// The sprite build history: the ZIPs editors downloaded from the Sprite Builder, each with a version number (v1, v2, ... per project, never reused), newest first, at most MAX_STORED_SPRITE_BUILDS per project (older ones are dropped as new ones arrive). Viewers of a project can list and download them; editors can add and delete them.
import mongoose, { type Types } from "mongoose";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import Project from "../models/Project.js";
import SpriteBuild, { MAX_STORED_SPRITE_BUILDS, MAX_STORED_SPRITE_BYTES, type SpriteBuildDoc } from "../models/SpriteBuild.js";

type Id = Types.ObjectId;

export type SpriteBuildSummary = { id: string; version: number; mode: SpriteBuildDoc["mode"]; iconCount: number; size: number; createdAt: Date };

// Keeps a downloaded sprite ZIP. The bytes must be a ZIP and fit the size limit.
export async function recordSpriteBuild(projectId: Id, userId: string, input: { mode: SpriteBuildDoc["mode"]; iconCount: number }, zip: Buffer): Promise<SpriteBuildSummary> {
  if (zip.length === 0) throw new BadRequestError("The sprite ZIP is empty.");
  if (zip.length > MAX_STORED_SPRITE_BYTES) throw new BadRequestError("The sprite ZIP is too large to keep (12 MB at most).");
  if (!(zip[0] === 0x50 && zip[1] === 0x4b)) throw new BadRequestError("That file is not a ZIP.");
  const counted = await Project.findOneAndUpdate({ _id: projectId }, { $inc: { spriteBuildCount: 1 } }, { returnDocument: "after", projection: { spriteBuildCount: 1 } });
  if (!counted) throw new NotFoundError("Project not found");
  const row = await SpriteBuild.create({ projectId, version: counted.spriteBuildCount, mode: input.mode, iconCount: input.iconCount, size: zip.length, createdBy: new mongoose.Types.ObjectId(userId), zip });
  const extra = await SpriteBuild.find({ projectId }, { _id: 1 }).sort({ createdAt: -1, _id: -1 }).skip(MAX_STORED_SPRITE_BUILDS).lean();
  if (extra.length > 0) await SpriteBuild.deleteMany({ _id: { $in: extra.map((item) => item._id) } });
  return { id: String(row._id), version: row.version, mode: row.mode, iconCount: row.iconCount, size: row.size, createdAt: row.createdAt as Date };
}

export async function listSpriteBuilds(projectId: Id): Promise<SpriteBuildSummary[]> {
  const rows = await SpriteBuild.find({ projectId }, { zip: 0 }).sort({ createdAt: -1, _id: -1 }).lean();
  return rows.map((row) => ({ id: String(row._id), version: row.version, mode: row.mode, iconCount: row.iconCount, size: row.size, createdAt: row.createdAt as Date }));
}

async function findBuild(projectId: Id, buildId: string, withZip: boolean) {
  if (!mongoose.isValidObjectId(buildId)) throw new NotFoundError("Build not found");
  const row = await SpriteBuild.findOne({ _id: buildId, projectId }, withZip ? {} : { zip: 0 });
  if (!row) throw new NotFoundError("Build not found");
  return row;
}

export async function getSpriteBuildZip(projectId: Id, buildId: string) {
  const row = await findBuild(projectId, buildId, true);
  return { version: row.version, zip: Buffer.from(row.zip) };
}

export async function deleteSpriteBuild(projectId: Id, buildId: string): Promise<void> {
  const row = await findBuild(projectId, buildId, false);
  await SpriteBuild.deleteOne({ _id: row._id });
}

export async function deleteSpriteBuilds(projectId: Id): Promise<void> {
  await SpriteBuild.deleteMany({ projectId });
}
