// Folder routes. Mounted at /api; the sign-in check is attached per route so unknown /api paths still answer 404.
import { Router, type Request } from "express";
import { actorOf, loadProject, parseObjectId } from "../lib/http.js";
import { NotFoundError } from "../lib/errors.js";
import { createFolderSchema, moveFolderSchema, renameFolderSchema } from "../lib/validation.js";
import { requireDb } from "../middleware/requireDb.js";
import { requireUser } from "../middleware/requireUser.js";
import Folder from "../models/Folder.js";
import { createFolder, deleteFolder, listFolders, moveFolder, renameFolder } from "../services/folderService.js";

const router = Router();
// Sign-in is required under /folders only, so other /api paths keep answering 404. The /projects/:projectId/folders routes below are already behind the project router's check (it is mounted first in app.ts); actorOf still answers 401 if that were ever missing.
router.use("/folders", requireDb, requireUser);

const serialize = (folder: { _id: unknown; projectId: unknown; parentId?: unknown; name: string; orderIndex: number }) => ({
  id: String(folder._id),
  projectId: String(folder.projectId),
  parentId: folder.parentId ? String(folder.parentId) : null,
  name: folder.name,
  orderIndex: folder.orderIndex,
});

// Loads a folder and checks the user may change its project.
async function loadFolderForEdit(req: Request) {
  const actor = actorOf(req);
  const folder = await Folder.findById(parseObjectId(req.params.folderId, "folder id"));
  if (!folder) throw new NotFoundError("Folder not found.");
  await loadProject(actor, folder.projectId, "edit");
  return folder;
}

router.get("/projects/:projectId/folders", async (req, res) => {
  const project = await loadProject(actorOf(req), req.params.projectId, "view");
  res.json(await listFolders(project._id));
});

router.post("/projects/:projectId/folders", async (req, res) => {
  const actor = actorOf(req);
  const input = createFolderSchema.parse(req.body ?? {});
  const project = await loadProject(actor, req.params.projectId, "edit");
  const parentId = input.parentId ? parseObjectId(input.parentId, "parent folder id") : null;
  res.status(201).json(serialize(await createFolder(project._id, { name: input.name, parentId })));
});

router.patch("/folders/:folderId", async (req, res) => {
  const input = renameFolderSchema.parse(req.body ?? {});
  const folder = await loadFolderForEdit(req);
  res.json(serialize(await renameFolder(folder, input.name)));
});

router.post("/folders/:folderId/move", async (req, res) => {
  const input = moveFolderSchema.parse(req.body ?? {});
  const folder = await loadFolderForEdit(req);
  const parentId = input.parentId ? parseObjectId(input.parentId, "parent folder id") : null;
  res.json(serialize(await moveFolder(folder, parentId, input.orderIndex)));
});

// Deletes the folder and its subfolders; the icons inside are moved to the project root.
router.delete("/folders/:folderId", async (req, res) => {
  const folder = await loadFolderForEdit(req);
  res.json(await deleteFolder(folder));
});

export default router;
