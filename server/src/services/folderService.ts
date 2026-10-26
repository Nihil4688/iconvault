// Folder rules: names are unique among siblings, a folder can never move into itself or its own subfolder, and deleting a folder moves its icons to the project root instead of deleting them.
import mongoose, { type HydratedDocument, type Types } from "mongoose";
import { BadRequestError, ConflictError } from "../lib/errors.js";
import { assertFolderRoom } from "../lib/quotas.js";
import Folder, { type FolderDoc } from "../models/Folder.js";
import Icon from "../models/Icon.js";

type Id = Types.ObjectId;
type FolderDocument = HydratedDocument<FolderDoc>;

// Case-insensitive comparison for folder names.
const NAME_COLLATION = { locale: "en", strength: 2 } as const;

export async function assertFolderInProject(projectId: Id, folderId: Id | null | undefined): Promise<void> {
  if (!folderId) return;
  const exists = await Folder.exists({ _id: folderId, projectId });
  if (!exists) throw new BadRequestError("That folder does not exist in this project.");
}

async function assertNameFree(projectId: Id, parentId: Id | null, name: string, ignoreId?: Id): Promise<void> {
  const clash = await Folder.findOne({ projectId, parentId, name, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) })
    .collation(NAME_COLLATION)
    .select({ _id: 1 })
    .lean();
  if (clash) throw new ConflictError(`A folder named "${name}" already exists here.`);
}

async function nextOrderIndex(projectId: Id, parentId: Id | null, ignoreId?: Id): Promise<number> {
  return Folder.countDocuments({ projectId, parentId, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
}

// All folders of a project, with the number of active icons directly inside each, plus the count of uncategorized icons.
export async function listFolders(projectId: Id) {
  const [folders, counts] = await Promise.all([
    Folder.find({ projectId }).sort({ orderIndex: 1, name: 1 }).lean(),
    Icon.aggregate<{ _id: Id | null; count: number }>([
      { $match: { projectId, deletedAt: null } },
      { $group: { _id: "$folderId", count: { $sum: 1 } } },
    ]),
  ]);
  const byFolder = new Map(counts.map((row) => [String(row._id), row.count]));
  return {
    folders: folders.map((folder) => ({
      id: String(folder._id),
      projectId: String(folder.projectId),
      parentId: folder.parentId ? String(folder.parentId) : null,
      name: folder.name,
      orderIndex: folder.orderIndex,
      iconCount: byFolder.get(String(folder._id)) ?? 0,
    })),
    uncategorizedCount: byFolder.get("null") ?? 0,
  };
}

export async function createFolder(projectId: Id, input: { name: string; parentId: Id | null }): Promise<FolderDocument> {
  await assertFolderInProject(projectId, input.parentId);
  await assertNameFree(projectId, input.parentId, input.name);
  await assertFolderRoom(projectId);
  return Folder.create({
    projectId,
    parentId: input.parentId,
    name: input.name,
    orderIndex: await nextOrderIndex(projectId, input.parentId),
  });
}

export async function renameFolder(folder: FolderDocument, name: string): Promise<FolderDocument> {
  await assertNameFree(folder.projectId, folder.parentId ?? null, name, folder._id);
  folder.name = name;
  return folder.save();
}

// Every folder id below `rootId` (not including it), found in memory because a project has few folders.
export async function descendantIds(projectId: Id, rootId: Id): Promise<Set<string>> {
  const all = await Folder.find({ projectId }).select({ _id: 1, parentId: 1 }).lean();
  const children = new Map<string, string[]>();
  for (const folder of all) {
    const key = folder.parentId ? String(folder.parentId) : "";
    children.set(key, [...(children.get(key) ?? []), String(folder._id)]);
  }
  const found = new Set<string>();
  const queue = [String(rootId)];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of children.get(current) ?? []) {
      if (!found.has(child)) {
        found.add(child);
        queue.push(child);
      }
    }
  }
  return found;
}

export async function moveFolder(
  folder: FolderDocument,
  parentId: Id | null,
  orderIndex?: number,
): Promise<FolderDocument> {
  if (parentId) {
    await assertFolderInProject(folder.projectId, parentId);
    if (String(parentId) === String(folder._id) || (await descendantIds(folder.projectId, folder._id)).has(String(parentId))) {
      throw new BadRequestError("A folder cannot be moved into itself or one of its subfolders.");
    }
  }
  await assertNameFree(folder.projectId, parentId, folder.name, folder._id);
  folder.parentId = parentId;
  folder.orderIndex = orderIndex ?? (await nextOrderIndex(folder.projectId, parentId, folder._id));
  return folder.save();
}

// Deletes the folder and all subfolders. Their icons (including trashed ones) are kept and moved to the project root.
export async function deleteFolder(folder: FolderDocument): Promise<{ deletedFolders: number; movedIcons: number }> {
  const below = [...(await descendantIds(folder.projectId, folder._id))].map((id) => new mongoose.Types.ObjectId(id));
  const ids = [folder._id, ...below];
  const moved = await Icon.updateMany({ projectId: folder.projectId, folderId: { $in: ids } }, { $set: { folderId: null } });
  const removed = await Folder.deleteMany({ projectId: folder.projectId, _id: { $in: ids } });
  return { deletedFolders: removed.deletedCount, movedIcons: moved.modifiedCount };
}

// Finds or creates the folder chain for a ZIP path such as ["UI", "Arrows"], under `baseParentId`. Existing folders with the same name are reused (Icon Vault created duplicates). `cache` lets one upload resolve each path once.
export async function ensureFolderPath(
  projectId: Id,
  baseParentId: Id | null,
  segments: string[],
  state: { created: number; cache: Map<string, Id> },
): Promise<Id | null> {
  let parentId = baseParentId;
  for (const raw of segments) {
    const name = raw.trim().slice(0, 100).trim();
    if (!name || name === "." || name === "..") continue;
    const key = `${parentId ? String(parentId) : ""}/${name.toLowerCase()}`;
    const cached = state.cache.get(key);
    if (cached) {
      parentId = cached;
      continue;
    }
    const existing = await Folder.findOne({ projectId, parentId, name }).collation(NAME_COLLATION).select({ _id: 1 }).lean();
    let id: Id;
    if (existing) {
      id = existing._id;
    } else {
      await assertFolderRoom(projectId);
      const created = await Folder.create({ projectId, parentId, name, orderIndex: await nextOrderIndex(projectId, parentId) });
      id = created._id;
      state.created += 1;
    }
    state.cache.set(key, id);
    parentId = id;
  }
  return parentId;
}
