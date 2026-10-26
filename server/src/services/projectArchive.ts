// Moving a whole project in and out as one ZIP. The archive holds `project.json` (settings, folders, and for each icon its name, folder, tags and codepoint) plus the SVG files. Saved versions and the trash are not included. Importing never trusts the archive: every SVG goes through the same cleaning pipeline as an upload, and the manifest is validated.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import mongoose, { type HydratedDocument, type Types } from "mongoose";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { SignedInActor } from "../lib/http.js";
import { assertProjectRoom } from "../lib/quotas.js";
import { codepointSchema, createProjectSchema } from "../lib/validation.js";
import Folder from "../models/Folder.js";
import Icon from "../models/Icon.js";
import Project, { type ProjectDoc } from "../models/Project.js";
import { ensureFolderPath } from "./folderService.js";
import { importSvg, normalizeTags } from "./iconService.js";
import { getProjectDetail } from "./projectService.js";

type Id = Types.ObjectId;

export const ARCHIVE_FORMAT = "iconvault-project";
// Exports made before the rename carry this name; they still import.
const LEGACY_ARCHIVE_FORMAT = "svg-sprite-compiler-project";
export const ARCHIVE_VERSION = 1;
export const ARCHIVE_LIMITS = { maxIcons: 5000, maxTotalBytes: 100_000_000, maxEntryBytes: 1_000_000, maxFolders: 2000 };

const folderPath = z.array(z.string().trim().min(1).max(100)).max(20);

const manifestSchema = z.object({
  format: z.enum([ARCHIVE_FORMAT, LEGACY_ARCHIVE_FORMAT]),
  version: z.literal(ARCHIVE_VERSION),
  project: createProjectSchema.pick({ name: true, description: true, prefix: true, color: true, purpose: true }),
  folders: z.array(folderPath).max(ARCHIVE_LIMITS.maxFolders).default([]),
  icons: z
    .array(
      z.object({
        file: z.string().min(1).max(500),
        name: z.string().trim().min(1).max(100),
        folder: folderPath.default([]),
        tags: z.array(z.string()).max(50).default([]),
        codepoint: codepointSchema.nullable().default(null),
        fontCodepoint: codepointSchema.nullable().default(null),
      }),
    )
    .max(ARCHIVE_LIMITS.maxIcons),
});
export type Manifest = z.infer<typeof manifestSchema>;

// A file or folder name that is safe inside a ZIP path (the manifest keeps the real names).
function safeSegment(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "_").trim();
  return cleaned || "_";
}

export async function exportProject(project: HydratedDocument<ProjectDoc>): Promise<{ filename: string; contentType: string; body: Buffer }> {
  const folders = await Folder.find({ projectId: project._id }).lean();
  const byId = new Map(folders.map((folder) => [String(folder._id), folder]));
  const pathOf = (folderId: Id | null | undefined): string[] => {
    const names: string[] = [];
    let current = folderId ? byId.get(String(folderId)) : undefined;
    // The length guard protects against a corrupted cycle.
    while (current && names.length < 20) {
      names.unshift(current.name);
      current = current.parentId ? byId.get(String(current.parentId)) : undefined;
    }
    return names;
  };

  const icons = await Icon.find({ projectId: project._id, deletedAt: null }).sort({ createdAt: 1, _id: 1 }).lean();
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const entries: Manifest["icons"] = icons.map((icon) => {
    const folder = pathOf(icon.folderId);
    const dir = ["icons", ...folder.map(safeSegment)].join("/");
    let file = `${dir}/${safeSegment(icon.slug)}.svg`;
    for (let n = 2; used.has(file.toLowerCase()); n += 1) file = `${dir}/${safeSegment(icon.slug)}-${n}.svg`;
    used.add(file.toLowerCase());
    files[file] = strToU8(icon.svg);
    return { file, name: icon.name, folder, tags: [...(icon.tags ?? [])], codepoint: icon.codepoint ?? null };
  });

  const manifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name: project.name, description: project.description ?? "", prefix: project.prefix ?? "icon", color: project.color ?? "#3b82f6", purpose: project.purpose ?? "sprite" },
    folders: folders.map((folder) => pathOf(folder._id)),
    icons: entries,
  };
  files["project.json"] = strToU8(JSON.stringify(manifest, null, 2));
  const slug = safeSegment(project.name).toLowerCase().replace(/\s+/g, "-").slice(0, 50) || "project";
  return { filename: `${slug}-export.zip`, contentType: "application/zip", body: Buffer.from(zipSync(files, { level: 6 })) };
}

export type ImportProblem = { file: string; message: string };
export type ImportResult = { project: Awaited<ReturnType<typeof getProjectDetail>>; imported: number; foldersCreated: number; problems: ImportProblem[] };

// Reads and checks the archive without touching the database.
export function readArchive(buffer: Buffer): { manifest: Manifest; files: Map<string, Buffer> } {
  let total = 0;
  let count = 0;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        const path = file.name.replace(/\\/g, "/");
        if (path.endsWith("/")) return false;
        if (path !== "project.json" && !/^icons\/.+\.svg$/i.test(path)) return false;
        count += 1;
        total += file.originalSize;
        if (count > ARCHIVE_LIMITS.maxIcons + 1) throw new BadRequestError(`The archive has more than ${ARCHIVE_LIMITS.maxIcons} icons.`);
        if (file.originalSize > ARCHIVE_LIMITS.maxEntryBytes) return false;
        if (total > ARCHIVE_LIMITS.maxTotalBytes) throw new BadRequestError("The archive expands to more than 100 MB.");
        return true;
      },
    });
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError("That file is not a valid ZIP archive.");
  }
  const manifestBytes = raw["project.json"];
  if (!manifestBytes) throw new BadRequestError("This archive has no project.json, so it is not a project export.");
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new BadRequestError("project.json is not valid JSON.");
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new BadRequestError(`project.json is not a supported export${first ? ` (${first.path.join(".") || "root"}: ${first.message})` : ""}.`);
  }
  const files = new Map<string, Buffer>();
  for (const [path, data] of Object.entries(raw)) if (path !== "project.json") files.set(path.replace(/\\/g, "/"), Buffer.from(data));
  return { manifest: parsed.data, files };
}

// Creates a new private project owned by the actor from an archive. Icons that cannot be imported are listed, not fatal; if nothing at all can be created the half-made project is removed.
export async function importProject(actor: SignedInActor, buffer: Buffer): Promise<ImportResult> {
  const { manifest, files } = readArchive(buffer);
  const ownerId = new mongoose.Types.ObjectId(actor.id);
  await assertProjectRoom(ownerId);
  const sameName = await Project.exists({ ownerId, name: manifest.project.name });
  const project = await Project.create({
    ...manifest.project,
    name: sameName ? `${manifest.project.name} (Imported)`.slice(0, 100) : manifest.project.name,
    ownerId,
    visibility: "private",
  });

  const problems: ImportProblem[] = [];
  const folderState = { created: 0, cache: new Map<string, Id>() };
  let imported = 0;
  try {
    for (const path of manifest.folders) await ensureFolderPath(project._id, null, path, folderState);
    for (const entry of manifest.icons) {
      const data = files.get(entry.file);
      if (!data) {
        problems.push({ file: entry.file, message: "The file named in project.json is missing from the archive." });
        continue;
      }
      try {
        const folderId = await ensureFolderPath(project._id, null, entry.folder, folderState);
        const outcome = await importSvg(project._id, { name: entry.name, raw: data, folderId, tags: normalizeTags(entry.tags) }, { strategy: "rename", optimize: false });
        if (outcome.status !== "created") continue;
        imported += 1;
        if (entry.codepoint) {
          // A taken or invalid codepoint is dropped, not fatal.
          try {
            if (entry.codepoint) outcome.icon.codepoint = entry.codepoint;
            await outcome.icon.save();
          } catch {
            problems.push({ file: entry.file, message: `The codepoint mapping for ${entry.name} could not be kept.` });
          }
        }
      } catch (err) {
        problems.push({ file: entry.file, message: err instanceof Error ? err.message : "Could not import this icon." });
      }
    }
  } catch (err) {
    await Folder.deleteMany({ projectId: project._id });
    await Icon.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    throw err;
  }
  if (imported === 0 && manifest.icons.length > 0) {
    await Folder.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    throw new BadRequestError(`None of the ${manifest.icons.length} icons could be imported. ${problems[0]?.message ?? ""}`.trim());
  }
  return { project: await getProjectDetail(project, actor), imported, foldersCreated: folderState.created, problems };
}
