// Administrator operations on users and project ownership. Users are never created or edited here (they come from Google or Microsoft sign-in) and there are no passwords: an admin can list users, delete one (their projects either go too or move to another user), and move a single project to another owner.
import mongoose, { type HydratedDocument, type Types } from "mongoose";
import { isAdminUser } from "../lib/admins.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import { escapeRegExp, type SignedInActor } from "../lib/http.js";
import type { ListUsersQuery } from "../lib/validation.js";
import ApiToken from "../models/ApiToken.js";
import Icon from "../models/Icon.js";
import Project, { type ProjectDoc } from "../models/Project.js";
import User from "../models/User.js";
import { deleteProject, getProjectDetail } from "./projectService.js";

type Id = Types.ObjectId;

export type AdminUser = {
  id: string;
  displayName: string;
  email: string;
  provider: string;
  picture: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  projectCount: number;
  iconCount: number;
  activeTokens: number;
  isAdmin: boolean;
  isSelf: boolean;
};

export async function listUsers(actor: SignedInActor, query: ListUsersQuery) {
  const filter: Record<string, unknown> = {};
  if (query.provider !== "all") filter.provider = query.provider;
  if (query.search) {
    const pattern = new RegExp(escapeRegExp(query.search), "i");
    filter.$or = [{ displayName: pattern }, { email: pattern }];
  }
  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .sort({ lastLoginAt: -1, _id: 1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .lean();
  const ids = users.map((user) => user._id);

  const [projects, tokens] = await Promise.all([
    Project.find({ ownerId: { $in: ids } }).select({ _id: 1, ownerId: 1 }).lean(),
    ApiToken.aggregate<{ _id: Id; n: number }>([{ $match: { userId: { $in: ids }, revokedAt: null } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
  ]);
  const ownerOf = new Map(projects.map((project) => [String(project._id), String(project.ownerId)]));
  const iconRows = await Icon.aggregate<{ _id: Id; n: number }>([
    { $match: { projectId: { $in: projects.map((project) => project._id) }, deletedAt: null } },
    { $group: { _id: "$projectId", n: { $sum: 1 } } },
  ]);

  const projectCount = new Map<string, number>();
  for (const owner of ownerOf.values()) projectCount.set(owner, (projectCount.get(owner) ?? 0) + 1);
  const iconCount = new Map<string, number>();
  for (const row of iconRows) {
    const owner = ownerOf.get(String(row._id));
    if (owner) iconCount.set(owner, (iconCount.get(owner) ?? 0) + row.n);
  }
  const tokenCount = new Map(tokens.map((row) => [String(row._id), row.n]));

  const items: AdminUser[] = users.map((user) => ({
    id: String(user._id),
    displayName: user.displayName,
    email: user.email,
    provider: user.provider,
    picture: user.picture ?? null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    projectCount: projectCount.get(String(user._id)) ?? 0,
    iconCount: iconCount.get(String(user._id)) ?? 0,
    activeTokens: tokenCount.get(String(user._id)) ?? 0,
    isAdmin: isAdminUser(user),
    isSelf: String(user._id) === actor.id,
  }));
  return { users: items, total, page: query.page, limit: query.limit };
}

async function loadUser(userId: Id, what = "User") {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError(`${what} not found.`);
  return user;
}

// Deletes a user and revokes their tokens. Their projects either move to `transferTo` or are deleted with everything in them. An admin cannot delete themselves, so there is always someone who can fix things.
export async function deleteUser(actor: SignedInActor, userId: Id, transferTo: Id | null) {
  if (String(userId) === actor.id) throw new BadRequestError("You cannot delete your own account.");
  const user = await loadUser(userId);
  if (transferTo) {
    if (String(transferTo) === String(userId)) throw new BadRequestError("Choose a different user to receive the projects.");
    await loadUser(transferTo, "The user to receive the projects");
  }

  let transferredProjects = 0;
  let deletedProjects = 0;
  let deletedIcons = 0;
  if (transferTo) {
    transferredProjects = (await Project.updateMany({ ownerId: user._id }, { $set: { ownerId: transferTo } })).modifiedCount;
  } else {
    for (const project of await Project.find({ ownerId: user._id })) {
      deletedIcons += (await deleteProject(project)).deletedIcons;
      deletedProjects += 1;
    }
  }
  const tokens = await ApiToken.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });
  return { deletedProjects, deletedIcons, transferredProjects, revokedTokens: tokens.deletedCount };
}

// Workspace totals for the admin screens.
export async function adminStats() {
  const [users, google, microsoft, projects, spriteProjects, publicProjects, draftProjects, icons, fontBuilds, activeTokens] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ provider: "google" }),
    User.countDocuments({ provider: "microsoft" }),
    Project.countDocuments({}),
    Project.countDocuments({ purpose: "sprite" }),
    Project.countDocuments({ visibility: "public" }),
    Project.countDocuments({ isArchived: true }),
    Icon.countDocuments({ deletedAt: null }),
    mongoose.connection.collection("font_builds").countDocuments({}),
    ApiToken.countDocuments({ revokedAt: null }),
  ]);
  const admins = (await User.find({}, { email: 1, provider: 1, emailVerified: 1 }).lean()).filter((user) => isAdminUser(user)).length;
  return { users, admins, members: users - admins, googleUsers: google, microsoftUsers: microsoft, projects, publicProjects, privateProjects: projects - publicProjects, spriteProjects, fontProjects: projects - spriteProjects, draftProjects, icons, fontBuilds, activeTokens };
}

export type BulkResult = { requested: number; done: number; failed: { id: string; name: string; message: string }[] };

// Moves several projects to one user. Each project is handled on its own, so one failure (for example the user already owns it) does not stop the rest.
export async function bulkTransferProjects(projectIds: Id[], toUserId: Id, actor: SignedInActor): Promise<BulkResult> {
  await loadUser(toUserId, "The new owner");
  const result: BulkResult = { requested: projectIds.length, done: 0, failed: [] };
  for (const id of projectIds) {
    const project = await Project.findById(id);
    if (!project) {
      result.failed.push({ id: String(id), name: "", message: "Project not found." });
      continue;
    }
    try {
      await transferProject(project, toUserId, actor);
      result.done += 1;
    } catch (err) {
      result.failed.push({ id: String(id), name: project.name, message: err instanceof Error ? err.message : "Could not move it." });
    }
  }
  return result;
}

// Deletes several projects for good, each with its icons, folders and history.
export async function bulkDeleteProjects(projectIds: Id[]): Promise<BulkResult & { deletedIcons: number }> {
  const result = { requested: projectIds.length, done: 0, failed: [] as BulkResult["failed"], deletedIcons: 0 };
  for (const id of projectIds) {
    const project = await Project.findById(id);
    if (!project) {
      result.failed.push({ id: String(id), name: "", message: "Project not found." });
      continue;
    }
    result.deletedIcons += (await deleteProject(project)).deletedIcons;
    result.done += 1;
  }
  return result;
}

// Moves one project to another user. The new owner gets full control; the previous owner keeps only what the visibility rules give them.
export async function transferProject(project: HydratedDocument<ProjectDoc>, toUserId: Id, actor: SignedInActor) {
  await loadUser(toUserId, "The new owner");
  if (String(project.ownerId) === String(toUserId)) throw new ConflictError("That user already owns this project.");
  project.ownerId = new mongoose.Types.ObjectId(toUserId);
  await project.save();
  return getProjectDetail(project, actor);
}
