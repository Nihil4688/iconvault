// Icon routes: upload (SVG files and ZIPs), paste, copy between projects, list, search, edit, versions, trash, batch actions and downloads. Mounted at /api. Project-scoped routes sit behind the project router's sign-in check (mounted first); /icons/* has its own.
import { Router, type Request } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { actorOf, loadProject, parseObjectId, sendDownload } from "../lib/http.js";
import {
  batchDeleteSchema,
  batchMoveSchema,
  batchTagSchema,
  DUPLICATE_STRATEGIES,
  copyIconsSchema,
  iconIdsSchema,
  iconSearchQuerySchema,
  listIconsQuerySchema,
  objectId,
  parseUploadFields,
  pasteIconSchema,
  updateIconSchema,
} from "../lib/validation.js";
import { heavyLimit } from "../middleware/rateLimit.js";
import { requireDb } from "../middleware/requireDb.js";
import { requireUser } from "../middleware/requireUser.js";
import Icon from "../models/Icon.js";
import IconVersion from "../models/IconVersion.js";
import { recordRequestActivity } from "../services/activityLogService.js";
import { assertFolderInProject } from "../services/folderService.js";
import { MAX_GLYPHS, importGlyphs, privateUseOnly, readFontGlyphs } from "../services/fontImport.js";
import {
  MAX_ICONS_PER_UPLOAD,
  batchDelete,
  batchMove,
  batchOptimize,
  batchRestore,
  batchTag,
  trashUncategorized,
  copyIcons,
  deletePermanently,
  downloadIcons,
  emptyTrash,
  importSvg,
  importUpload,
  listIcons,
  listVersions,
  moveToTrash,
  optimizeIcon,
  restoreFromTrash,
  restoreVersion,
  searchIcons,
  serializeIcon,
  updateIcon,
} from "../services/iconService.js";

const router = Router();
router.use("/icons", requireDb, requireUser);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 200 } });

const fontImportFieldsSchema = z.object({
  folderId: z.union([objectId, z.literal(""), z.literal("root")]).optional(),
  strategy: z.enum(DUPLICATE_STRATEGIES).default("rename"),
  optimize: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  privateUseOnly: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  dryRun: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});
function parseFontImportFields(body: Record<string, unknown> | undefined) {
  const parsed = fontImportFieldsSchema.parse({ ...(body ?? {}), folderId: body?.folderId });
  return { ...parsed, folderId: parsed.folderId === "" || parsed.folderId === "root" ? null : (parsed.folderId ?? null) };
}

const toIds = (ids: string[]) => ids.map((id) => new mongoose.Types.ObjectId(id));

function summaryIconIds(summary: { created: { id: string }[]; replaced: { id: string }[] }) {
  return [...summary.created, ...summary.replaced].map((icon) => new mongoose.Types.ObjectId(icon.id));
}

async function scopedIconIds(projectId: mongoose.Types.ObjectId, ids?: mongoose.Types.ObjectId[], trashed?: boolean) {
  return Icon.find({
    projectId,
    ...(ids ? { _id: { $in: ids } } : {}),
    ...(trashed === undefined ? {} : { deletedAt: trashed ? { $ne: null } : null }),
  })
    .select({ _id: 1 })
    .limit(1000)
    .lean()
    .then((icons) => icons.map((icon) => icon._id));
}

async function loadIcon(req: Request, need: "view" | "edit") {
  const actor = actorOf(req);
  const icon = await Icon.findById(parseObjectId(req.params.iconId, "icon id"));
  if (!icon) throw new NotFoundError("Icon not found.");
  await loadProject(actor, icon.projectId, need);
  return icon;
}

// ---- Within a project ----

router.get("/projects/:projectId/icons", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "view");
  const q = listIconsQuerySchema.parse(req.query);
  const folder = q.folderId === undefined ? "all" : q.folderId === "root" ? "root" : parseObjectId(q.folderId, "folder id");
  res.json(
    await listIcons(project._id, {
      folder,
      includeSubfolders: q.includeSubfolders,
      search: q.search,
      tag: q.tag,
      trash: q.trash,
      sort: q.sort,
      page: q.page,
      limit: q.limit,
      withSvg: q.svg,
    }),
  );
});

// Upload SVG files and ZIP archives (multipart field "files"). Fields: folderId, strategy (rename|replace|skip), optimize, tags.
router.post("/projects/:projectId/icons/upload", heavyLimit, upload.array("files", 200), async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const fields = parseUploadFields(req.body as Record<string, unknown> | undefined);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new BadRequestError('Attach at least one file in the "files" field.');
  const folderId = fields.folderId ? parseObjectId(fields.folderId, "folder id") : null;
  const optimize = typeof fields.optimize === "boolean" ? fields.optimize : fields.optimize === "true";
  const summary = await importUpload(
    project._id,
    files.map((f) => ({ originalname: f.originalname, mimetype: f.mimetype, buffer: f.buffer })),
    { strategy: fields.strategy, optimize, folderId, tags: fields.tags },
  );
  const affectedEntityIds = summaryIconIds(summary);
  if (affectedEntityIds.length > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "upload",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        createdCount: summary.created.length,
        replacedCount: summary.replaced.length,
        affectedCount: affectedEntityIds.length,
        skippedCount: summary.skipped.length,
        errorCount: summary.errors.length,
        foldersCreated: summary.foldersCreated,
        fileNames: files.map((file) => file.originalname),
        createdNames: summary.created.map((icon) => icon.name),
        replacedNames: summary.replaced.map((icon) => icon.name),
      },
      affectedEntityIds,
      result: summary.errors.length > 0 ? "partial" : "success",
    });
  }
  res.status(summary.created.length > 0 ? 201 : 200).json({ ...summary, limitPerUpload: MAX_ICONS_PER_UPLOAD });
});

// Import the glyphs of an existing font (field "font": TTF, OTF, WOFF, WOFF2 or SVG font; optional field "mapping": a CSS or JSON file that names the characters). Fields: folderId, strategy, optimize, privateUseOnly (default true), dryRun (only report what would be imported).
const fontFiles = upload.fields([{ name: "font", maxCount: 1 }, { name: "mapping", maxCount: 1 }]);
router.post("/projects/:projectId/icons/import-font", heavyLimit, fontFiles, async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const fields = parseFontImportFields(req.body as Record<string, unknown> | undefined);
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const font = files?.font?.[0];
  if (!font) throw new BadRequestError('Attach the font in the "font" field.');
  const read = await readFontGlyphs(font.buffer, files?.mapping?.[0]?.buffer.toString("utf8") ?? "");
  const wanted = fields.privateUseOnly ? privateUseOnly(read.glyphs) : read.glyphs;
  if (wanted.length === 0) {
    throw new BadRequestError(fields.privateUseOnly && read.glyphs.length > 0 ? "This font has no icons in the Private Use Area. Turn off \"only icon characters\" to import every glyph." : "This font has no glyphs with outlines to import.");
  }
  const preview = { kind: read.kind, total: read.total, importable: wanted.length, truncated: read.truncated, limit: MAX_GLYPHS, sample: wanted.slice(0, 12).map((glyph) => ({ name: glyph.name, codepoint: glyph.codepoint })) };
  if (fields.dryRun) {
    res.json({ dryRun: true, ...preview });
    return;
  }
  const folderId = fields.folderId ? parseObjectId(fields.folderId, "folder id") : null;
  await assertFolderInProject(project._id, folderId);
  const summary = await importGlyphs(project._id, wanted, { strategy: fields.strategy, optimize: fields.optimize, folderId });
  const affectedEntityIds = summaryIconIds(summary);
  if (affectedEntityIds.length > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "upload",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        source: "font import",
        sourceFontName: font.originalname,
        fontKind: read.kind,
        createdCount: summary.created.length,
        replacedCount: summary.replaced.length,
        affectedCount: affectedEntityIds.length,
        skippedCount: summary.skipped.length,
        errorCount: summary.errors.length,
        codepointsKept: summary.codepointsKept,
        codepointsDropped: summary.codepointsDropped,
      },
      affectedEntityIds,
      result: summary.errors.length > 0 ? "partial" : "success",
    });
  }
  res.status(summary.created.length > 0 ? 201 : 200).json({ dryRun: false, ...preview, ...summary });
});

router.post("/projects/:projectId/icons/paste", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = pasteIconSchema.parse(req.body ?? {});
  const folderId = input.folderId ? parseObjectId(input.folderId, "folder id") : null;
  await assertFolderInProject(project._id, folderId);
  const outcome = await importSvg(
    project._id,
    { name: input.name, raw: input.rawSvg, folderId, tags: input.tags },
    { strategy: input.strategy, optimize: input.optimize },
  );
  if (outcome.status === "skipped") {
    res.json({ outcome: "skipped", reason: outcome.reason });
    return;
  }
  await recordRequestActivity(req, project, {
    actionDone: outcome.status === "created" ? "upload" : "update",
    entityType: "icon",
    entityId: outcome.icon._id,
    entityName: outcome.icon.name,
    details: {
      source: "paste",
      outcome: outcome.status,
      byteSize: outcome.icon.byteSize,
      folderId: outcome.icon.folderId ? String(outcome.icon.folderId) : null,
      tags: outcome.icon.tags,
    },
  });
  res.status(outcome.status === "created" ? 201 : 200).json({ outcome: outcome.status, icon: serializeIcon(outcome.icon) });
});

// Copy icons from a project the user can view into this one (which they must be able to edit).
router.post("/projects/:projectId/icons/copy", heavyLimit, async (req, res) => {
  const actor = actorOf(req);
  const input = copyIconsSchema.parse(req.body ?? {});
  const target = await loadProject(actor, req.params.projectId, "edit");
  const source = await loadProject(actor, input.sourceProjectId, "view");
  const summary = await copyIcons(target._id, source._id, toIds(input.iconIds), {
    strategy: input.strategy,
    optimize: input.optimize,
    folderId: input.folderId ? parseObjectId(input.folderId, "folder id") : null,
  });
  const affectedEntityIds = summaryIconIds(summary);
  if (affectedEntityIds.length > 0) {
    await recordRequestActivity(req, target, {
      actionDone: "copy",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        sourceProjectId: String(source._id),
        sourceProjectName: source.name,
        createdCount: summary.created.length,
        replacedCount: summary.replaced.length,
        affectedCount: affectedEntityIds.length,
        skippedCount: summary.skipped.length,
        errorCount: summary.errors.length,
        createdNames: summary.created.map((icon) => icon.name),
        replacedNames: summary.replaced.map((icon) => icon.name),
      },
      affectedEntityIds,
      result: summary.errors.length > 0 ? "partial" : "success",
    });
  }
  res.status(summary.created.length > 0 ? 201 : 200).json(summary);
});

// One icon downloads as an SVG, several as a ZIP.
router.post("/projects/:projectId/icons/download", heavyLimit, async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "view");
  const input = iconIdsSchema.parse(req.body ?? {});
  const file = await downloadIcons(project._id, toIds(input.iconIds));
  sendDownload(res, file);
});

router.post("/projects/:projectId/icons/batch/move", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = batchMoveSchema.parse(req.body ?? {});
  const ids = toIds(input.iconIds);
  const affectedEntityIds = await scopedIconIds(project._id, ids, false);
  const folderId = input.folderId ? parseObjectId(input.folderId, "folder id") : null;
  const result = await batchMove(project._id, ids, folderId);
  if (result.matched > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "move",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        requestedCount: result.requested,
        matchedCount: result.matched,
        destinationFolderId: folderId ? String(folderId) : null,
        affectedEntityIdsTruncated: result.matched > affectedEntityIds.length,
      },
      affectedEntityIds,
    });
  }
  res.json(result);
});

router.post("/projects/:projectId/icons/batch/tag", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = batchTagSchema.parse(req.body ?? {});
  const ids = toIds(input.iconIds);
  const affectedEntityIds = await scopedIconIds(project._id, ids, false);
  const result = await batchTag(project._id, ids, input.tags, input.mode);
  if (result.matched > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "tag",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        requestedCount: result.requested,
        matchedCount: result.matched,
        mode: input.mode,
        tags: input.tags,
        affectedEntityIdsTruncated: result.matched > affectedEntityIds.length,
      },
      affectedEntityIds,
    });
  }
  res.json(result);
});

// Moves to the trash; with "permanent": true it deletes icons that are already in the trash for good.
router.post("/projects/:projectId/icons/batch/delete", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = batchDeleteSchema.parse(req.body ?? {});
  const ids = toIds(input.iconIds);
  const affectedEntityIds = await scopedIconIds(project._id, ids, input.permanent);
  const result = await batchDelete(project._id, ids, input.permanent);
  if (result.matched > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "delete",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        deletionMode: input.permanent ? "permanent" : "trash",
        requestedCount: result.requested,
        deletedCount: result.matched,
        affectedEntityIdsTruncated: result.matched > affectedEntityIds.length,
      },
      affectedEntityIds,
    });
  }
  res.json(result);
});

// The sidebar's Uncategorized menu: send every icon that is in no folder to the trash.
router.post("/projects/:projectId/icons/uncategorized/trash", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const result = await trashUncategorized(project._id);
  if (result.matched > 0) {
    const affectedEntityIds = result.ids.slice(0, 1000).map((id) => new mongoose.Types.ObjectId(id));
    await recordRequestActivity(req, project, {
      actionDone: "delete",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        deletionMode: "trash",
        source: "uncategorized",
        deletedCount: result.matched,
        affectedEntityIdsTruncated: result.ids.length > affectedEntityIds.length,
      },
      affectedEntityIds,
    });
  }
  res.json(result);
});

router.post("/projects/:projectId/icons/batch/restore", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = iconIdsSchema.parse(req.body ?? {});
  const ids = toIds(input.iconIds);
  const affectedEntityIds = await scopedIconIds(project._id, ids, true);
  const result = await batchRestore(project._id, ids);
  if (result.matched > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "restore",
      entityType: "icon",
      entityId: affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        requestedCount: result.requested,
        restoredCount: result.matched,
        adjustedCount: result.adjusted.length,
        affectedEntityIdsTruncated: result.matched > affectedEntityIds.length,
      },
      affectedEntityIds,
    });
  }
  res.json(result);
});

router.post("/projects/:projectId/icons/batch/optimize", heavyLimit, async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = iconIdsSchema.parse(req.body ?? {});
  const ids = toIds(input.iconIds);
  const result = await batchOptimize(project._id, ids);
  const affectedEntityIds = result.optimizedIds;
  if (result.optimized > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "optimize",
      entityType: "icon",
      entityId: result.optimized === 1 && affectedEntityIds.length === 1 ? affectedEntityIds[0] ?? null : null,
      details: {
        requestedCount: result.requested,
        matchedCount: result.matched,
        optimizedCount: result.optimized,
        failedCount: result.failed.length,
        bytesBefore: result.bytesBefore,
        bytesAfter: result.bytesAfter,
      },
      affectedEntityIds,
      result: result.failed.length > 0 ? "partial" : "success",
    });
  }
  const { optimizedIds: _optimizedIds, ...response } = result;
  res.json(response);
});

router.delete("/projects/:projectId/icons/trash", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const affectedEntityIds = await scopedIconIds(project._id, undefined, true);
  const result = await emptyTrash(project._id);
  if (result.deleted > 0) {
    await recordRequestActivity(req, project, {
      actionDone: "clear",
      entityType: "project",
      entityId: project._id,
      entityName: project.name,
      details: { deletedCount: result.deleted, affectedEntityIdsTruncated: result.deleted > affectedEntityIds.length },
      affectedEntityIds,
    });
  }
  res.json(result);
});

// ---- Single icons and search ----

// Defined before /icons/:iconId so "search" is not read as an id.
router.get("/icons/search", async (req, res) => {
  const q = iconSearchQuerySchema.parse(req.query);
  res.json(await searchIcons(actorOf(req), q.q, q.page, q.limit));
});

router.get("/icons/:iconId", async (req, res) => {
  const icon = await loadIcon(req, "view");
  res.json({ ...serializeIcon(icon), versions: await listVersions(icon._id) });
});

router.get("/icons/:iconId/download", async (req, res) => {
  const icon = await loadIcon(req, "view");
  sendDownload(res, { filename: `${icon.slug}.svg`, contentType: "image/svg+xml", body: Buffer.from(icon.svg, "utf8") });
});

router.patch("/icons/:iconId", async (req, res) => {
  const input = updateIconSchema.parse(req.body ?? {});
  const icon = await loadIcon(req, "edit");
  const before = {
    name: icon.name,
    slug: icon.slug,
    folderId: icon.folderId ? String(icon.folderId) : null,
    tags: [...icon.tags],
    codepoint: icon.codepoint,
    byteSize: icon.byteSize,
    svg: icon.svg,
  };
  const updated = await updateIcon(icon, input);
  const after = {
    name: updated.name,
    slug: updated.slug,
    folderId: updated.folderId ? String(updated.folderId) : null,
    tags: [...updated.tags],
    codepoint: updated.codepoint,
    byteSize: updated.byteSize,
    svg: updated.svg,
  };
  const changes: Record<string, unknown> = Object.fromEntries(
    Object.keys(before)
      .filter((key) => key !== "svg" && JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after]))
      .map((key) => [key, { before: before[key as keyof typeof before], after: after[key as keyof typeof after] }]),
  );
  if (input.rawSvg !== undefined && before.svg !== after.svg) {
    changes.svg = { beforeByteSize: before.byteSize, afterByteSize: after.byteSize };
  }
  if (Object.keys(changes).length > 0) {
    const project = await loadProject(actorOf(req), updated.projectId, "edit");
    await recordRequestActivity(req, project, {
      actionDone: "update",
      entityType: "icon",
      entityId: updated._id,
      entityName: updated.name,
      changes,
      details: { changedFields: Object.keys(changes) },
    });
  }
  res.json({ ...serializeIcon(updated) });
});

router.post("/icons/:iconId/optimize", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  const { icon: updated, ...stats } = await optimizeIcon(icon);
  if (stats.changed) {
    const project = await loadProject(actorOf(req), updated.projectId, "edit");
    await recordRequestActivity(req, project, {
      actionDone: "optimize",
      entityType: "icon",
      entityId: updated._id,
      entityName: updated.name,
      details: { bytesBefore: stats.before, bytesAfter: stats.after, savingsPercent: stats.savingsPercent },
    });
  }
  res.json({ icon: serializeIcon(updated), ...stats });
});

router.get("/icons/:iconId/versions", async (req, res) => {
  const icon = await loadIcon(req, "view");
  res.json({ versions: await listVersions(icon._id) });
});

router.post("/icons/:iconId/versions/:versionId/restore", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  const beforeSvg = icon.svg;
  const beforeByteSize = icon.byteSize;
  const restored = await restoreVersion(icon, parseObjectId(req.params.versionId, "version id"));
  if (beforeSvg !== restored.svg) {
    const project = await loadProject(actorOf(req), restored.projectId, "edit");
    await recordRequestActivity(req, project, {
      actionDone: "restore",
      entityType: "icon",
      entityId: restored._id,
      entityName: restored.name,
      details: { versionId: String(req.params.versionId), beforeByteSize, afterByteSize: restored.byteSize, svgRestored: true },
    });
  }
  res.json({ ...serializeIcon(restored), versions: await listVersions(restored._id) });
});

// Moves to the trash; add ?permanent=true to delete an icon that is already in the trash for good.
router.delete("/icons/:iconId", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  const project = await loadProject(actorOf(req), icon.projectId, "edit");
  const wasActive = !icon.deletedAt;
  if (req.query.permanent === "true") {
    const deletedVersions = await IconVersion.countDocuments({ iconId: icon._id });
    await deletePermanently(icon);
    await recordRequestActivity(req, project, {
      actionDone: "delete",
      entityType: "icon",
      entityId: icon._id,
      entityName: icon.name,
      details: { deletionMode: "permanent", deletedVersions },
    });
    res.json({ deleted: true });
    return;
  }
  const trashed = await moveToTrash(icon);
  if (wasActive) {
    await recordRequestActivity(req, project, {
      actionDone: "delete",
      entityType: "icon",
      entityId: trashed._id,
      entityName: trashed.name,
      details: { deletionMode: "trash", deletedAt: trashed.deletedAt },
    });
  }
  res.json(serializeIcon(trashed, false));
});

router.post("/icons/:iconId/restore", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  const wasTrashed = Boolean(icon.deletedAt);
  const { icon: restored, adjusted } = await restoreFromTrash(icon);
  if (wasTrashed) {
    const project = await loadProject(actorOf(req), restored.projectId, "edit");
    await recordRequestActivity(req, project, {
      actionDone: "restore",
      entityType: "icon",
      entityId: restored._id,
      entityName: restored.name,
      details: { adjusted },
    });
  }
  res.json({ icon: serializeIcon(restored), adjusted });
});

export default router;
