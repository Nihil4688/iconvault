// Everything that happens to icons: importing (with rename/replace/skip), editing, saved versions, trash, batch actions that stay inside one project, copying between projects, listing, search and download.
import mongoose, { type HydratedDocument, type QueryFilter, type Types } from "mongoose";
import { MongoBulkWriteError } from "mongodb";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { escapeRegExp, type SignedInActor } from "../lib/http.js";
import { nameFromFileName, slugify } from "../lib/slug.js";
import type { UpdateIconInput } from "../lib/validation.js";
import Icon, { type IconDoc } from "../models/Icon.js";
import IconVersion from "../models/IconVersion.js";
import Project from "../models/Project.js";
import { deleteIconsAndVersions } from "./cascade.js";
import { assertIconRoom, quotas, withProjectIconWriteLock } from "../lib/quotas.js";
import { assertFolderInProject, descendantIds, ensureFolderPath } from "./folderService.js";
import { prepareSvg, type PreparedSvg } from "./svgPipeline.js";
import { buildZip, readSvgsFromZip } from "./zipService.js";
import { allocateCodepointRange, allocateNextCodepoint } from "./codepointService.js";
import { mapWithConcurrency } from "../lib/concurrency.js";

type Id = Types.ObjectId;
export type IconDocument = HydratedDocument<IconDoc>;
export type Strategy = "rename" | "replace" | "skip";

// How many earlier states are kept per icon.
export const MAX_VERSIONS_PER_ICON = 20;
// Most SVG files processed in one upload request (across all ZIPs).
export const MAX_ICONS_PER_UPLOAD = 1000;
const UPLOAD_CONCURRENCY = 8;

type IconLike = Pick<
  IconDocument,
  | "_id" | "projectId" | "folderId" | "name" | "slug" | "svg" | "tags" | "byteSize" | "originalByteSize"
  | "codepoint" | "width" | "height" | "viewBox" | "hasStroke" | "hasGradient" | "hasText"
  | "deletedAt" | "createdAt" | "updatedAt"
>;

export function serializeIcon(icon: IconLike, withSvg = true) {
  return {
    id: String(icon._id),
    projectId: String(icon.projectId),
    folderId: icon.folderId ? String(icon.folderId) : null,
    name: icon.name,
    slug: icon.slug,
    tags: [...(icon.tags ?? [])],
    byteSize: icon.byteSize,
    originalByteSize: icon.originalByteSize ?? 0,
    codepoint: icon.codepoint ?? null,
    width: icon.width ?? 24,
    height: icon.height ?? 24,
    viewBox: icon.viewBox ?? "0 0 24 24",
    hasStroke: icon.hasStroke ?? false,
    hasGradient: icon.hasGradient ?? false,
    hasText: icon.hasText ?? false,
    deletedAt: icon.deletedAt ?? null,
    createdAt: icon.createdAt,
    updatedAt: icon.updatedAt,
    ...(withSvg ? { svg: icon.svg } : {}),
  };
}

export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))];
}

function applyPrepared(icon: IconDocument, prepared: PreparedSvg, keepOriginalSize = false): void {
  icon.svg = prepared.svg;
  icon.byteSize = prepared.byteSize;
  if (!keepOriginalSize || !icon.originalByteSize) icon.originalByteSize = prepared.originalByteSize;
  icon.width = prepared.width;
  icon.height = prepared.height;
  icon.viewBox = prepared.viewBox;
  icon.hasStroke = prepared.hasStroke;
  icon.hasGradient = prepared.hasGradient;
  icon.hasText = prepared.hasText;
}

// Saves the icon's current markup as a version, keeping only the newest MAX_VERSIONS_PER_ICON.
async function saveVersion(icon: IconDocument): Promise<void> {
  await IconVersion.create({ iconId: icon._id, svg: icon.svg, byteSize: icon.byteSize });
  const old = await IconVersion.find({ iconId: icon._id }).sort({ createdAt: -1, _id: -1 }).skip(MAX_VERSIONS_PER_ICON).select({ _id: 1 }).lean();
  if (old.length > 0) await IconVersion.deleteMany({ _id: { $in: old.map((v) => v._id) } });
}

// The first "base-N" slug not used by an active icon in the project.
async function freeSlug(projectId: Id, base: string): Promise<{ slug: string; n: number }> {
  const rows = await Icon.find({ projectId, deletedAt: null, slug: { $regex: new RegExp(`^${escapeRegExp(base)}(-\\d+)?$`) } })
    .select({ slug: 1 })
    .lean();
  const taken = new Set(rows.map((row) => row.slug));
  for (let n = 1; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 100 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return { slug: candidate, n };
  }
}

export type ImportOutcome =
  | { status: "created"; icon: IconDocument }
  | { status: "replaced"; icon: IconDocument }
  | { status: "skipped"; name: string; reason: string };

export type ImportInput = { name: string; raw: string | Buffer; folderId: Id | null; tags: string[] };
export type ImportOptions = { strategy: Strategy; optimize: boolean; multipass?: boolean };

// Adds one SVG to a project. Throws BadRequestError when the markup is unusable. What happens when an active icon already has the same slug depends on the strategy.
export async function importSvg(projectId: Id, input: ImportInput, options: ImportOptions): Promise<ImportOutcome> {
  const prepared = prepareSvg(input.raw, {
    optimize: options.optimize,
    ...(options.multipass === undefined ? {} : { multipass: options.multipass }),
  });
  const name = input.name.trim().slice(0, 100).trim() || "Icon";
  const baseSlug = slugify(name);
  const tags = normalizeTags(input.tags);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await Icon.findOne({ projectId, slug: baseSlug, deletedAt: null });

    if (existing && options.strategy === "skip") {
      return { status: "skipped", name, reason: "An icon with that name already exists." };
    }

    if (existing && options.strategy === "replace") {
      if (!existing.codepoint) existing.codepoint = await allocateNextCodepoint(projectId);
      if (existing.svg !== prepared.svg) {
        await saveVersion(existing);
        applyPrepared(existing, prepared);
      }
      if (existing.isModified()) await existing.save();
      return { status: "replaced", icon: existing };
    }

    let finalName = name;
    let slug = baseSlug;
    if (existing) {
      const free = await freeSlug(projectId, baseSlug);
      slug = free.slug;
      finalName = `${name.slice(0, 100 - ` (${free.n})`.length)} (${free.n})`;
    }

    try {
      const icon = await withProjectIconWriteLock(projectId, async () => {
        await assertIconRoom(projectId);
        const codepoint = await allocateNextCodepoint(projectId);
        return Icon.create({
          projectId,
          folderId: input.folderId,
          name: finalName,
          slug,
          tags,
          codepoint,
          svg: prepared.svg,
          byteSize: prepared.byteSize,
          originalByteSize: prepared.originalByteSize,
          width: prepared.width,
          height: prepared.height,
          viewBox: prepared.viewBox,
          hasStroke: prepared.hasStroke,
          hasGradient: prepared.hasGradient,
          hasText: prepared.hasText,
        });
      });
      return { status: "created", icon };
    } catch (err) {
      // Someone created the same slug at the same moment; look again.
      if ((err as { code?: number }).code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  throw new ConflictError("Could not pick a free id for that icon. Please try again.");
}

export type UploadFile = { originalname: string; mimetype: string; buffer: Buffer };
export type UploadSummary = {
  created: ReturnType<typeof serializeIcon>[];
  replaced: ReturnType<typeof serializeIcon>[];
  skipped: { name: string; reason: string }[];
  errors: { file: string; message: string }[];
  foldersCreated: number;
};

type UploadEntry = { index: number; displayName: string; data: Buffer; folderId: Id | null };
type UploadEntryResult = ImportOutcome | { status: "error"; file: string; message: string };
type PreparedUploadEntry = UploadEntry & { name: string; slug: string; prepared: PreparedSvg };

async function tryBulkImportUpload(
  projectId: Id,
  entries: UploadEntry[],
  options: ImportOptions & { folderId: Id | null; tags: string[] },
): Promise<UploadSummary | null> {
  const summary: UploadSummary = { created: [], replaced: [], skipped: [], errors: [], foldersCreated: 0 };
  const preparedEntries: PreparedUploadEntry[] = [];
  const outcomes: (UploadEntryResult | undefined)[] = new Array(entries.length);

  for (const entry of entries) {
    try {
      const name = nameFromFileName(entry.displayName);
      preparedEntries.push({
        ...entry,
        name,
        slug: slugify(name),
        prepared: prepareSvg(entry.data, { optimize: options.optimize, multipass: false }),
      });
    } catch (err) {
      outcomes[entry.index] = {
        status: "error",
        file: entry.displayName,
        message: err instanceof Error ? err.message : "Could not add this file.",
      };
    }
  }

  if (preparedEntries.length === 0) {
    for (const outcome of outcomes) {
      if (outcome?.status === "error") summary.errors.push({ file: outcome.file, message: outcome.message });
    }
    return summary;
  }

  const slugs = preparedEntries.map((entry) => entry.slug);
  if (new Set(slugs).size !== slugs.length) return null;
  const failedIndexes = await withProjectIconWriteLock(projectId, async () => {
    const currentIconCount = await Icon.countDocuments({ projectId });
    if (currentIconCount + preparedEntries.length > quotas.iconsPerProject()) return null;

    const existing = await Icon.find({ projectId, slug: { $in: slugs }, deletedAt: null }).select({ _id: 1 }).lean();
    if (existing.length > 0) return null;

    const codepoints = await allocateCodepointRange(projectId, preparedEntries.length);
    if (!codepoints) return null;

    const tags = normalizeTags(options.tags);
    const documents = preparedEntries.map((entry, index) => ({
      _id: new mongoose.Types.ObjectId(),
      projectId,
      folderId: entry.folderId,
      name: entry.name,
      slug: entry.slug,
      tags,
      codepoint: codepoints[index]!,
      svg: entry.prepared.svg,
      byteSize: entry.prepared.byteSize,
      originalByteSize: entry.prepared.originalByteSize,
      width: entry.prepared.width,
      height: entry.prepared.height,
      viewBox: entry.prepared.viewBox,
      hasStroke: entry.prepared.hasStroke,
      hasGradient: entry.prepared.hasGradient,
      hasText: entry.prepared.hasText,
      deletedAt: null,
    }));
    const failed = new Set<number>();
    try {
      await Icon.bulkWrite(documents.map((document) => ({ insertOne: { document } })), { ordered: false });
    } catch (err) {
      if (!(err instanceof MongoBulkWriteError)) throw err;
      const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
      if (writeErrors.length === 0 || writeErrors.some((writeError) => writeError.code !== 11000)) throw err;
      for (const writeError of writeErrors) failed.add(writeError.index);
    }

    const successfulIds = documents.filter((_, index) => !failed.has(index)).map((document) => document._id);
    if (successfulIds.length > 0) {
      const inserted = await Icon.find({ _id: { $in: successfulIds } });
      const iconsById = new Map(inserted.map((icon) => [String(icon._id), icon]));
      for (let index = 0; index < preparedEntries.length; index += 1) {
        if (failed.has(index)) continue;
        const entry = preparedEntries[index]!;
        const icon = iconsById.get(String(documents[index]!._id));
        if (!icon) throw new Error(`The uploaded icon "${entry.displayName}" was not found after insertion.`);
        outcomes[entry.index] = { status: "created", icon };
      }
    }
    return failed;
  });
  if (failedIndexes === null) return null;

  const failedEntries = preparedEntries.filter((_, index) => failedIndexes.has(index));
  const failedOutcomes = await mapWithConcurrency(failedEntries, UPLOAD_CONCURRENCY, async (entry) => {
    try {
      return await importSvg(
        projectId,
        { name: entry.name, raw: entry.data, folderId: entry.folderId, tags: options.tags },
        { ...options, multipass: false },
      );
    } catch (err) {
      return {
        status: "error" as const,
        file: entry.displayName,
        message: err instanceof Error ? err.message : "Could not add this file.",
      };
    }
  });
  failedEntries.forEach((entry, index) => {
    outcomes[entry.index] = failedOutcomes[index];
  });

  for (const outcome of outcomes) {
    if (!outcome) continue;
    if (outcome.status === "created") summary.created.push(serializeIcon(outcome.icon, false));
    else if (outcome.status === "replaced") summary.replaced.push(serializeIcon(outcome.icon, false));
    else if (outcome.status === "skipped") summary.skipped.push({ name: outcome.name, reason: outcome.reason });
    else summary.errors.push({ file: outcome.file, message: outcome.message });
  }
  return summary;
}

// Imports SVG files and ZIP archives with bounded parallelism; entries with the same slug stay ordered. A ZIP's folder structure is recreated under `folderId` (existing folders are reused).
export async function importUpload(
  projectId: Id,
  files: UploadFile[],
  options: ImportOptions & { folderId: Id | null; tags: string[] },
): Promise<UploadSummary> {
  await assertFolderInProject(projectId, options.folderId);
  const summary: UploadSummary = { created: [], replaced: [], skipped: [], errors: [], foldersCreated: 0 };
  const folderState = { created: 0, cache: new Map<string, Id>() };
  const entries: UploadEntry[] = [];
  const groups = new Map<string, UploadEntry[]>();
  const addEntry = (displayName: string, data: Buffer, folderId: Id | null) => {
    if (entries.length >= MAX_ICONS_PER_UPLOAD) {
      summary.errors.push({ file: displayName, message: `Only ${MAX_ICONS_PER_UPLOAD} icons can be added per upload.` });
      return;
    }
    const entry = { index: entries.length, displayName, data, folderId };
    entries.push(entry);
    const key = slugify(nameFromFileName(displayName));
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  };

  for (const file of files) {
    const lower = file.originalname.toLowerCase();
    if (lower.endsWith(".zip") || file.mimetype === "application/zip" || file.mimetype === "application/x-zip-compressed") {
      try {
        const zip = readSvgsFromZip(file.buffer);
        for (const skipped of zip.skipped) summary.errors.push({ file: skipped.path, message: skipped.reason });
        for (const entry of zip.entries) {
          const folderId = await ensureFolderPath(projectId, options.folderId, entry.folders, folderState);
          addEntry([...entry.folders, entry.fileName].join("/"), entry.data, folderId);
        }
      } catch (err) {
        summary.errors.push({ file: file.originalname, message: err instanceof Error ? err.message : "Could not read this ZIP." });
      }
    } else if (lower.endsWith(".svg")) {
      addEntry(file.originalname, file.buffer, options.folderId);
    } else {
      summary.errors.push({ file: file.originalname, message: "Only .svg and .zip files can be uploaded." });
    }
  }

  if (entries.length > 0) {
    const bulkSummary = await tryBulkImportUpload(projectId, entries, options);
    if (bulkSummary) {
      summary.created.push(...bulkSummary.created);
      summary.replaced.push(...bulkSummary.replaced);
      summary.skipped.push(...bulkSummary.skipped);
      summary.errors.push(...bulkSummary.errors);
      summary.foldersCreated = folderState.created;
      return summary;
    }
    const currentIconCount = await Icon.countDocuments({ projectId });
    const quotaLimited = currentIconCount + entries.length > quotas.iconsPerProject();
    const uploadGroups = quotaLimited ? entries.map((entry) => [entry]) : [...groups.values()];
    const outcomes = await mapWithConcurrency(uploadGroups, quotaLimited ? 1 : UPLOAD_CONCURRENCY, async (group) => {
      const groupOutcomes: { index: number; outcome: ImportOutcome | { status: "error"; file: string; message: string } }[] = [];
      for (const entry of group) {
        try {
          const outcome = await importSvg(
            projectId,
            { name: nameFromFileName(entry.displayName), raw: entry.data, folderId: entry.folderId, tags: options.tags },
            { ...options, multipass: false },
          );
          groupOutcomes.push({ index: entry.index, outcome });
        } catch (err) {
          groupOutcomes.push({
            index: entry.index,
            outcome: { status: "error", file: entry.displayName, message: err instanceof Error ? err.message : "Could not add this file." },
          });
        }
      }
      return groupOutcomes;
    });

    for (const { outcome } of outcomes.flat().sort((a, b) => a.index - b.index)) {
      if (outcome.status === "created") summary.created.push(serializeIcon(outcome.icon, false));
      else if (outcome.status === "replaced") summary.replaced.push(serializeIcon(outcome.icon, false));
      else if (outcome.status === "skipped") summary.skipped.push({ name: outcome.name, reason: outcome.reason });
      else summary.errors.push({ file: outcome.file, message: outcome.message });
    }
  }

  summary.foldersCreated = folderState.created;
  return summary;
}

function assertActive(icon: IconDocument): void {
  if (icon.deletedAt) throw new ConflictError("This icon is in the trash. Restore it first.");
}

// Edits an icon. A new name also gives it a new id (slug); a clash is refused instead of renaming silently. Changing the SVG saves the previous markup as a version.
export async function updateIcon(icon: IconDocument, input: UpdateIconInput): Promise<IconDocument> {
  assertActive(icon);

  if (input.name !== undefined && input.name !== icon.name) {
    const slug = slugify(input.name);
    if (slug !== icon.slug) {
      const clash = await Icon.exists({ projectId: icon.projectId, slug, deletedAt: null, _id: { $ne: icon._id } });
      if (clash) throw new ConflictError(`Another icon already uses the id "${slug}".`);
      icon.slug = slug;
    }
    icon.name = input.name;
  }

  if (input.folderId !== undefined) {
    const folderId = input.folderId ? new mongoose.Types.ObjectId(input.folderId) : null;
    await assertFolderInProject(icon.projectId, folderId);
    icon.folderId = folderId;
  }

  if (input.tags !== undefined) icon.tags = normalizeTags(input.tags);

  if (input.codepoint !== undefined) {
    if (input.codepoint !== null) {
      const clash = await Icon.findOne({ projectId: icon.projectId, codepoint: input.codepoint, deletedAt: null, _id: { $ne: icon._id } }).select({ name: 1 }).lean();
      if (clash) throw new ConflictError(`Codepoint ${input.codepoint} is already used by "${clash.name}".`);
    }
    icon.codepoint = input.codepoint;
  }

  if (input.rawSvg !== undefined) {
    const prepared = prepareSvg(input.rawSvg, { optimize: false });
    if (prepared.svg !== icon.svg) {
      await saveVersion(icon);
      applyPrepared(icon, prepared);
    }
  }

  return icon.save();
}

export async function optimizeIcon(icon: IconDocument) {
  assertActive(icon);
  const before = icon.byteSize;
  const prepared = prepareSvg(icon.svg, { optimize: true });
  if (prepared.svg === icon.svg) {
    return { icon, changed: false, before, after: before, savingsPercent: 0 };
  }
  await saveVersion(icon);
  applyPrepared(icon, prepared, true);
  await icon.save();
  const savingsPercent = before > 0 ? Math.max(0, Math.round(((before - icon.byteSize) / before) * 100)) : 0;
  return { icon, changed: true, before, after: icon.byteSize, savingsPercent };
}

export async function listVersions(iconId: Id) {
  const versions = await IconVersion.find({ iconId }).sort({ createdAt: -1, _id: -1 }).select({ byteSize: 1, createdAt: 1 }).lean();
  return versions.map((v) => ({ id: String(v._id), byteSize: v.byteSize, createdAt: v.createdAt }));
}

// Brings back the markup of an earlier version. The current markup is saved first, so the restore can itself be undone.
export async function restoreVersion(icon: IconDocument, versionId: Id): Promise<IconDocument> {
  assertActive(icon);
  const version = await IconVersion.findOne({ _id: versionId, iconId: icon._id });
  if (!version) throw new NotFoundError("Version not found.");
  if (version.svg !== icon.svg) {
    await saveVersion(icon);
    applyPrepared(icon, prepareSvg(version.svg, { optimize: false }), true);
    await icon.save();
  }
  return icon;
}

export async function moveToTrash(icon: IconDocument): Promise<IconDocument> {
  if (!icon.deletedAt) {
    icon.deletedAt = new Date();
    await icon.save();
  }
  return icon;
}

// Takes an icon out of the trash. If its id or codepoint was taken in the meantime, the icon gets a free id (with a numbered name) and loses the codepoint; what changed is reported.
export async function restoreFromTrash(icon: IconDocument): Promise<{ icon: IconDocument; adjusted: string[] }> {
  const adjusted: string[] = [];
  if (!icon.deletedAt) return { icon, adjusted };

  const slugTaken = await Icon.exists({ projectId: icon.projectId, slug: icon.slug, deletedAt: null, _id: { $ne: icon._id } });
  if (slugTaken) {
    const free = await freeSlug(icon.projectId, icon.slug);
    icon.slug = free.slug;
    icon.name = `${icon.name.slice(0, 100 - ` (${free.n})`.length)} (${free.n})`;
    adjusted.push(`id changed to "${free.slug}" because the old one is in use`);
  }
  if (icon.codepoint) {
    const cpTaken = await Icon.exists({ projectId: icon.projectId, codepoint: icon.codepoint, deletedAt: null, _id: { $ne: icon._id } });
    if (cpTaken) {
      adjusted.push(`codepoint ${icon.codepoint} cleared because it is in use`);
      icon.codepoint = null;
    }
  }
  icon.deletedAt = null;
  await icon.save();
  return { icon, adjusted };
}

// Permanent deletion is only for icons already in the trash.
export async function deletePermanently(icon: IconDocument): Promise<void> {
  if (!icon.deletedAt) throw new ConflictError("Move the icon to the trash before deleting it permanently.");
  await deleteIconsAndVersions({ _id: icon._id });
}

// ---- Batch actions. Every query is filtered by projectId, so ids from another project are ignored, never touched. ----

export async function batchMove(projectId: Id, ids: Id[], folderId: Id | null) {
  await assertFolderInProject(projectId, folderId);
  const result = await Icon.updateMany({ projectId, _id: { $in: ids }, deletedAt: null }, { $set: { folderId } });
  return { requested: ids.length, matched: result.matchedCount };
}

export async function batchTag(projectId: Id, ids: Id[], tags: string[], mode: "add" | "remove" | "set") {
  const clean = normalizeTags(tags);
  const filter = { projectId, _id: { $in: ids }, deletedAt: null };
  const update =
    mode === "add" ? { $addToSet: { tags: { $each: clean } } } : mode === "remove" ? { $pull: { tags: { $in: clean } } } : { $set: { tags: clean } };
  const result = await Icon.updateMany(filter, update);
  return { requested: ids.length, matched: result.matchedCount };
}

export async function batchDelete(projectId: Id, ids: Id[], permanent: boolean) {
  if (permanent) {
    const deleted = await deleteIconsAndVersions({ projectId, _id: { $in: ids }, deletedAt: { $ne: null } });
    return { requested: ids.length, matched: deleted };
  }
  const result = await Icon.updateMany({ projectId, _id: { $in: ids }, deletedAt: null }, { $set: { deletedAt: new Date() } });
  return { requested: ids.length, matched: result.matchedCount };
}

// Moves every active icon that is in no folder to the trash. Returns the ids so the page can offer Undo.
export async function trashUncategorized(projectId: Id) {
  const icons = await Icon.find({ projectId, folderId: null, deletedAt: null }, { _id: 1 }).lean();
  const ids = icons.map((icon) => String(icon._id));
  if (ids.length > 0) await Icon.updateMany({ projectId, _id: { $in: icons.map((icon) => icon._id) }, deletedAt: null }, { $set: { deletedAt: new Date() } });
  return { ids, matched: ids.length };
}

export async function batchRestore(projectId: Id, ids: Id[]) {
  const icons = await Icon.find({ projectId, _id: { $in: ids }, deletedAt: { $ne: null } });
  const adjusted: { id: string; changes: string[] }[] = [];
  for (const icon of icons) {
    const result = await restoreFromTrash(icon);
    if (result.adjusted.length > 0) adjusted.push({ id: String(icon._id), changes: result.adjusted });
  }
  return { requested: ids.length, matched: icons.length, adjusted };
}

export async function batchOptimize(projectId: Id, ids: Id[]) {
  const icons = await Icon.find({ projectId, _id: { $in: ids }, deletedAt: null });
  const optimizedIds: Id[] = [];
  let optimized = 0;
  let before = 0;
  let after = 0;
  const failed: { id: string; message: string }[] = [];
  for (const icon of icons) {
    try {
      const r = await optimizeIcon(icon);
      before += r.before;
      after += r.after;
      if (r.changed) {
        optimized += 1;
        optimizedIds.push(icon._id);
      }
    } catch (err) {
      failed.push({ id: String(icon._id), message: err instanceof Error ? err.message : "Could not optimize." });
    }
  }
  return { requested: ids.length, matched: icons.length, optimized, optimizedIds, bytesBefore: before, bytesAfter: after, failed };
}

export async function emptyTrash(projectId: Id) {
  return { deleted: await deleteIconsAndVersions({ projectId, deletedAt: { $ne: null } }) };
}

// Copies icons from a project the actor can view into another project they can edit. Source icons are looked up inside the source project only.
export async function copyIcons(
  targetProjectId: Id,
  sourceProjectId: Id,
  ids: Id[],
  options: ImportOptions & { folderId: Id | null },
): Promise<UploadSummary> {
  await assertFolderInProject(targetProjectId, options.folderId);
  const sources = await Icon.find({ projectId: sourceProjectId, _id: { $in: ids }, deletedAt: null }).sort({ name: 1 });
  const summary: UploadSummary = { created: [], replaced: [], skipped: [], errors: [], foldersCreated: 0 };
  for (const source of sources) {
    try {
      const outcome = await importSvg(targetProjectId, { name: source.name, raw: source.svg, folderId: options.folderId, tags: [...source.tags] }, options);
      if (outcome.status === "created") summary.created.push(serializeIcon(outcome.icon, false));
      else if (outcome.status === "replaced") summary.replaced.push(serializeIcon(outcome.icon, false));
      else summary.skipped.push({ name: outcome.name, reason: outcome.reason });
    } catch (err) {
      summary.errors.push({ file: source.name, message: err instanceof Error ? err.message : "Could not copy this icon." });
    }
  }
  const found = new Set(sources.map((s) => String(s._id)));
  for (const id of ids) {
    if (!found.has(String(id))) summary.errors.push({ file: String(id), message: "Icon not found in the source project." });
  }
  return summary;
}

// ---- Reading ----

export type ListIconsOptions = {
  folder: "all" | "root" | Id;
  includeSubfolders: boolean;
  search?: string | undefined;
  tag?: string | undefined;
  trash: boolean;
  sort: "newest" | "oldest" | "name" | "name-desc" | "largest" | "deleted";
  page: number;
  limit: number;
  withSvg: boolean;
};

const SORTS: Record<ListIconsOptions["sort"], Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name: { name: 1, _id: 1 },
  "name-desc": { name: -1, _id: -1 },
  largest: { byteSize: -1, _id: 1 },
  deleted: { deletedAt: -1, _id: -1 },
};

export async function listIcons(projectId: Id, options: ListIconsOptions) {
  const filter: QueryFilter<IconDoc> = { projectId, deletedAt: options.trash ? { $ne: null } : null };

  if (options.folder === "root") {
    filter.folderId = null;
  } else if (options.folder !== "all") {
    if (options.includeSubfolders) {
      const below = [...(await descendantIds(projectId, options.folder))].map((id) => new mongoose.Types.ObjectId(id));
      filter.folderId = { $in: [options.folder, ...below] };
    } else {
      filter.folderId = options.folder;
    }
  }
  if (options.search) {
    const pattern = new RegExp(escapeRegExp(options.search), "i");
    filter.$or = [{ name: pattern }, { slug: pattern }, { tags: pattern }];
  }
  if (options.tag) filter.tags = options.tag.toLowerCase();

  const query = Icon.find(filter).sort(SORTS[options.sort]).skip((options.page - 1) * options.limit).limit(options.limit);
  if (!options.withSvg) query.select({ svg: 0 });
  if (options.sort === "name" || options.sort === "name-desc") query.collation({ locale: "en", strength: 2 });

  const [icons, total] = await Promise.all([query.lean(), Icon.countDocuments(filter)]);
  return {
    icons: icons.map((icon) => serializeIcon({ ...icon, svg: icon.svg ?? "" }, options.withSvg)),
    total,
    page: options.page,
    limit: options.limit,
  };
}

// Search across every project the actor may see (own and public, not archived; all for admins), active icons only.
export async function searchIcons(actor: SignedInActor, q: string, page: number, limit: number) {
  const mine = new mongoose.Types.ObjectId(actor.id);
  const visible = actor.isAdmin ? { isArchived: false } : { isArchived: false, $or: [{ ownerId: mine }, { visibility: "public" as const }] };
  const projects = await Project.find(visible).select({ name: 1, prefix: 1, color: 1, visibility: 1, purpose: 1 }).lean();
  const byId = new Map(projects.map((p) => [String(p._id), p]));
  const pattern = new RegExp(escapeRegExp(q), "i");
  const filter: QueryFilter<IconDoc> = {
    projectId: { $in: projects.map((p) => p._id) },
    deletedAt: null,
    $or: [{ name: pattern }, { slug: pattern }, { tags: pattern }],
  };
  const [icons, total] = await Promise.all([
    Icon.find(filter).sort({ name: 1, _id: 1 }).collation({ locale: "en", strength: 2 }).skip((page - 1) * limit).limit(limit).lean(),
    Icon.countDocuments(filter),
  ]);
  return {
    icons: icons.map((icon) => {
      const project = byId.get(String(icon.projectId));
      return {
        ...serializeIcon(icon),
        project: project
          ? { id: String(project._id), name: project.name, prefix: project.prefix, color: project.color, visibility: project.visibility, purpose: project.purpose }
          : null,
      };
    }),
    total,
    page,
    limit,
  };
}

// One SVG, or a ZIP when several icons are requested. Only icons of the given project are included.
export async function downloadIcons(projectId: Id, ids: Id[]): Promise<{ filename: string; contentType: string; body: Buffer }> {
  const icons = await Icon.find({ projectId, _id: { $in: ids }, deletedAt: null }).sort({ name: 1 }).lean();
  if (icons.length === 0) throw new NotFoundError("No matching icons found.");
  if (icons.length === 1) {
    const only = icons[0] as (typeof icons)[number];
    return { filename: `${only.slug}.svg`, contentType: "image/svg+xml", body: Buffer.from(only.svg, "utf8") };
  }
  const used = new Set<string>();
  const files = icons.map((icon) => {
    let name = `${icon.slug}.svg`;
    for (let n = 2; used.has(name); n += 1) name = `${icon.slug}-${n}.svg`;
    used.add(name);
    return { name, content: icon.svg };
  });
  return { filename: "icons.zip", contentType: "application/zip", body: buildZip(files) };
}
