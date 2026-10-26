// Per-account and per-project size limits, so one account cannot fill the database. The defaults can be changed with environment variables (MAX_PROJECTS_PER_USER, MAX_ICONS_PER_PROJECT, MAX_FOLDERS_PER_PROJECT). Trashed icons count: they still take space.
import type { Types } from "mongoose";
import Folder from "../models/Folder.js";
import Icon from "../models/Icon.js";
import Project from "../models/Project.js";
import { ConflictError } from "./errors.js";

function limit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const quotas = {
  projectsPerUser: () => limit("MAX_PROJECTS_PER_USER", 200),
  iconsPerProject: () => limit("MAX_ICONS_PER_PROJECT", 5000),
  foldersPerProject: () => limit("MAX_FOLDERS_PER_PROJECT", 2000),
};

export async function assertProjectRoom(ownerId: Types.ObjectId | string): Promise<void> {
  const max = quotas.projectsPerUser();
  if ((await Project.countDocuments({ ownerId })) >= max) {
    throw new ConflictError(`You can own ${max} projects at most. Delete a project you no longer need first.`);
  }
}

export async function assertIconRoom(projectId: Types.ObjectId): Promise<void> {
  const max = quotas.iconsPerProject();
  if ((await Icon.countDocuments({ projectId })) >= max) {
    throw new ConflictError(`A project can hold ${max} icons at most (the trash counts). Delete icons or empty the trash first.`);
  }
}

export async function assertFolderRoom(projectId: Types.ObjectId): Promise<void> {
  const max = quotas.foldersPerProject();
  if ((await Folder.countDocuments({ projectId })) >= max) {
    throw new ConflictError(`A project can hold ${max} folders at most.`);
  }
}
