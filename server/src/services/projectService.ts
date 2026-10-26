// Project operations: list (with the icon counts and sample icons the dashboard shows), detail, create, update, delete with cascade, and duplicate.
import mongoose, { type HydratedDocument, type Types } from "mongoose";
import { escapeRegExp, type SignedInActor } from "../lib/http.js";
import { isFontCodepoint } from "../lib/codepoint.js";
import { describeAccess, type AccessFlags } from "../lib/permissions.js";
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from "../lib/validation.js";
import Folder from "../models/Folder.js";
import Icon from "../models/Icon.js";
import Project, { type ProjectDoc } from "../models/Project.js";
import User from "../models/User.js";
import { assertProjectRoom } from "../lib/quotas.js";
import { deleteIconsAndVersions } from "./cascade.js";
import { deleteFontBuilds } from "./fontHistory.js";
import { deleteSpriteBuilds } from "./spriteHistory.js";

type Id = Types.ObjectId;
type ProjectLike = Pick<
  HydratedDocument<ProjectDoc>,
  "_id" | "ownerId" | "name" | "description" | "prefix" | "color" | "purpose" | "visibility" | "isArchived" | "uncategorizedName" | "createdAt" | "updatedAt"
>;

export type SampleIcon = { id: string; name: string; svg: string };

export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  prefix: string;
  color: string;
  purpose: "sprite" | "font";
  visibility: "public" | "private";
  isArchived: boolean;
  uncategorizedName: string;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; displayName: string; email?: string };
  iconCount: number;
  sampleIcons: SampleIcon[];
  access: AccessFlags;
};

// Maps owner ids to a public summary. Emails are only shown to admins, and to people looking at their own projects.
async function ownerSummaries(ids: Id[], actor: SignedInActor) {
  const unique = [...new Map(ids.map((id) => [String(id), id])).values()];
  const users = await User.find({ _id: { $in: unique } }).select({ displayName: 1, email: 1 }).lean();
  return new Map(
    users.map((user) => {
      const showEmail = actor.isAdmin || String(user._id) === actor.id;
      const owner: { id: string; displayName: string; email?: string } = {
        id: String(user._id),
        displayName: user.displayName,
      };
      if (showEmail) owner.email = user.email;
      return [String(user._id), owner] as const;
    }),
  );
}

function serialize(
  project: ProjectLike,
  actor: SignedInActor,
  owner: ProjectSummary["owner"] | undefined,
  iconCount: number,
  sampleIcons: SampleIcon[],
): ProjectSummary {
  return {
    id: String(project._id),
    name: project.name,
    description: project.description ?? "",
    prefix: project.prefix ?? "icon",
    color: project.color ?? "#3b82f6",
    purpose: project.purpose ?? "sprite",
    visibility: project.visibility ?? "private",
    isArchived: project.isArchived ?? false,
    uncategorizedName: project.uncategorizedName ?? "",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    owner: owner ?? { id: String(project.ownerId), displayName: "Unknown user" },
    iconCount,
    sampleIcons,
    access: describeAccess(actor, { ownerId: project.ownerId, visibility: project.visibility ?? "private" }),
  };
}

// Active icon counts and up to five sample icons for each project, in one aggregation.
async function countsAndSamples(projectIds: Id[]) {
  const rows = await Icon.aggregate<{ _id: Id; iconCount: number; samples: SampleIcon[] }>([
    { $match: { projectId: { $in: projectIds }, deletedAt: null } },
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $group: {
        _id: "$projectId",
        iconCount: { $sum: 1 },
        samples: { $firstN: { input: { id: { $toString: "$_id" }, name: "$name", svg: "$svg" }, n: 5 } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

export async function listProjects(actor: SignedInActor, query: ListProjectsQuery) {
  const mine = new mongoose.Types.ObjectId(actor.id);
  const filter: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  // Non-admins see their own projects and public ones; admins see everything.
  if (!actor.isAdmin) and.push({ $or: [{ ownerId: mine }, { visibility: "public" }] });
  if (query.scope === "mine") and.push({ ownerId: mine });
  if (query.scope === "public") and.push({ visibility: "public" });
  if (query.status !== "all") and.push({ isArchived: query.status === "archived" });
  if (query.purpose !== "all") and.push({ purpose: query.purpose });
  if (query.owner) and.push({ ownerId: new mongoose.Types.ObjectId(query.owner) });
  if (query.search) {
    const pattern = new RegExp(escapeRegExp(query.search), "i");
    const fields: Record<string, unknown>[] = [{ name: pattern }, { description: pattern }, { prefix: pattern }];
    // Admins also find projects by their owner's name or email.
    if (actor.isAdmin) {
      const owners = await User.find({ $or: [{ displayName: pattern }, { email: pattern }] }, { _id: 1 }).limit(200).lean();
      if (owners.length > 0) fields.push({ ownerId: { $in: owners.map((owner) => owner._id) } });
    }
    and.push({ $or: fields });
  }
  if (and.length > 0) filter.$and = and;

  const projects = await Project.find(filter).limit(1000).lean();
  const [owners, stats] = await Promise.all([
    ownerSummaries(projects.map((p) => p.ownerId), actor),
    countsAndSamples(projects.map((p) => p._id)),
  ]);

  const items = projects.map((project) => {
    const stat = stats.get(String(project._id));
    return serialize(project, actor, owners.get(String(project.ownerId)), stat?.iconCount ?? 0, stat?.samples ?? []);
  });

  items.sort((a, b) => {
    switch (query.sort) {
      case "name":
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      case "icons":
        return b.iconCount - a.iconCount || a.name.localeCompare(b.name);
      case "created":
        return b.createdAt.getTime() - a.createdAt.getTime();
      default:
        return b.updatedAt.getTime() - a.updatedAt.getTime();
    }
  });

  const start = (query.page - 1) * query.limit;
  return { projects: items.slice(start, start + query.limit), total: items.length, page: query.page, limit: query.limit };
}

export async function getProjectDetail(project: HydratedDocument<ProjectDoc>, actor: SignedInActor) {
  const [owners, stats, folderCount, trashCount] = await Promise.all([
    ownerSummaries([project.ownerId], actor),
    countsAndSamples([project._id]),
    Folder.countDocuments({ projectId: project._id }),
    Icon.countDocuments({ projectId: project._id, deletedAt: { $ne: null } }),
  ]);
  const stat = stats.get(String(project._id));
  return {
    ...serialize(project, actor, owners.get(String(project.ownerId)), stat?.iconCount ?? 0, stat?.samples ?? []),
    folderCount,
    trashCount,
  };
}

export async function createProject(actor: SignedInActor, input: CreateProjectInput) {
  await assertProjectRoom(actor.id);
  const project = await Project.create({ ...input, ownerId: new mongoose.Types.ObjectId(actor.id) });
  return getProjectDetail(project, actor);
}

export async function updateProject(project: HydratedDocument<ProjectDoc>, input: UpdateProjectInput, actor: SignedInActor) {
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) project.set(key, value);
  }
  await project.save();
  return getProjectDetail(project, actor);
}

// Deletes the project with all its icons, versions and folders. The project itself goes last.
export async function deleteProject(project: HydratedDocument<ProjectDoc>) {
  const deletedIcons = await deleteIconsAndVersions({ projectId: project._id });
  const folders = await Folder.deleteMany({ projectId: project._id });
  await deleteFontBuilds(project._id);
  await deleteSpriteBuilds(project._id);
  await Project.deleteOne({ _id: project._id });
  return { deletedIcons, deletedFolders: folders.deletedCount };
}

// Copies a project the actor can view into a new private project they own: folders (parents first) and active icons. Versions, the trash and build history are not copied.
export async function duplicateProject(source: HydratedDocument<ProjectDoc>, actor: SignedInActor) {
  await assertProjectRoom(actor.id);
  const copy = await Project.create({
    ownerId: new mongoose.Types.ObjectId(actor.id),
    name: `${source.name} (Copy)`.slice(0, 100),
    description: source.description ?? "",
    prefix: source.prefix ?? "icon",
    color: source.color ?? "#3b82f6",
    purpose: source.purpose ?? "sprite",
    visibility: "private",
    ...(source.uploadCodepointHighWatermark != null ? { uploadCodepointHighWatermark: source.uploadCodepointHighWatermark } : {}),
  });

  try {
    // Folders: create parents before children, whatever order they are stored in.
    const folders = await Folder.find({ projectId: source._id }).lean();
    const idMap = new Map<string, Id>();
    let pending = folders;
    while (pending.length > 0) {
      const ready = pending.filter((f) => !f.parentId || idMap.has(String(f.parentId)));
      if (ready.length === 0) break; // orphaned folders (should not happen); their icons go to the root
      for (const folder of ready) {
        const created = await Folder.create({
          projectId: copy._id,
          parentId: folder.parentId ? (idMap.get(String(folder.parentId)) ?? null) : null,
          name: folder.name,
          orderIndex: folder.orderIndex,
        });
        idMap.set(String(folder._id), created._id);
      }
      const done = new Set(ready.map((f) => String(f._id)));
      pending = pending.filter((f) => !done.has(String(f._id)));
    }

    // Icons, in batches.
    const icons = await Icon.find({ projectId: source._id, deletedAt: null }).sort({ createdAt: 1, _id: 1 }).lean();
    for (let i = 0; i < icons.length; i += 200) {
      await Icon.insertMany(
        icons.slice(i, i + 200).map((icon) => ({
          projectId: copy._id,
          folderId: icon.folderId ? (idMap.get(String(icon.folderId)) ?? null) : null,
          name: icon.name,
          slug: icon.slug,
          svg: icon.svg,
          tags: icon.tags,
          byteSize: icon.byteSize,
          originalByteSize: icon.originalByteSize,
          codepoint: icon.codepoint ?? null,
          width: icon.width,
          height: icon.height,
          viewBox: icon.viewBox,
          hasStroke: icon.hasStroke,
          hasGradient: icon.hasGradient,
          hasText: icon.hasText,
        })),
      );
    }
    if (source.uploadCodepointHighWatermark == null) {
      const lastAssigned = [...icons].reverse().find((icon) => icon.codepoint && isFontCodepoint(icon.codepoint))?.codepoint;
      if (lastAssigned) {
        copy.uploadCodepointHighWatermark = Number.parseInt(lastAssigned, 16);
        await copy.save();
      }
    }
  } catch (err) {
    // Do not leave a half-copied project behind.
    await deleteProject(copy);
    throw err;
  }

  return getProjectDetail(copy, actor);
}
