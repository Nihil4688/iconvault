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
  res.json(await batchMove(project._id, toIds(input.iconIds), input.folderId ? parseObjectId(input.folderId, "folder id") : null));
});

router.post("/projects/:projectId/icons/batch/tag", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = batchTagSchema.parse(req.body ?? {});
  res.json(await batchTag(project._id, toIds(input.iconIds), input.tags, input.mode));
});

// Moves to the trash; with "permanent": true it deletes icons that are already in the trash for good.
router.post("/projects/:projectId/icons/batch/delete", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = batchDeleteSchema.parse(req.body ?? {});
  res.json(await batchDelete(project._id, toIds(input.iconIds), input.permanent));
});

// The sidebar's Uncategorized menu: send every icon that is in no folder to the trash.
router.post("/projects/:projectId/icons/uncategorized/trash", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  res.json(await trashUncategorized(project._id));
});

router.post("/projects/:projectId/icons/batch/restore", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = iconIdsSchema.parse(req.body ?? {});
  res.json(await batchRestore(project._id, toIds(input.iconIds)));
});

router.post("/projects/:projectId/icons/batch/optimize", heavyLimit, async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  const input = iconIdsSchema.parse(req.body ?? {});
  res.json(await batchOptimize(project._id, toIds(input.iconIds)));
});

router.delete("/projects/:projectId/icons/trash", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "edit");
  res.json(await emptyTrash(project._id));
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
  res.json({ ...serializeIcon(await updateIcon(icon, input)) });
});

router.post("/icons/:iconId/optimize", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  const { icon: updated, ...stats } = await optimizeIcon(icon);
  res.json({ icon: serializeIcon(updated), ...stats });
});

router.get("/icons/:iconId/versions", async (req, res) => {
  const icon = await loadIcon(req, "view");
  res.json({ versions: await listVersions(icon._id) });
});

router.post("/icons/:iconId/versions/:versionId/restore", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  const restored = await restoreVersion(icon, parseObjectId(req.params.versionId, "version id"));
  res.json({ ...serializeIcon(restored), versions: await listVersions(restored._id) });
});

// Moves to the trash; add ?permanent=true to delete an icon that is already in the trash for good.
router.delete("/icons/:iconId", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  if (req.query.permanent === "true") {
    await deletePermanently(icon);
    res.json({ deleted: true });
    return;
  }
  res.json(serializeIcon(await moveToTrash(icon), false));
});

router.post("/icons/:iconId/restore", async (req, res) => {
  const icon = await loadIcon(req, "edit");
  const { icon: restored, adjusted } = await restoreFromTrash(icon);
  res.json({ icon: serializeIcon(restored), adjusted });
});

export default router;
