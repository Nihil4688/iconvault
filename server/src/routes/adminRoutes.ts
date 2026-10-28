// Admin routes: users and project ownership. Every route needs a signed-in admin (the ADMIN_EMAILS list). Mounted at /api/admin.
import { Router } from "express";
import { actorOf, loadProject, parseObjectId } from "../lib/http.js";
import { bulkDeleteProjectsSchema, bulkTransferSchema, deleteUserSchema, listUsersQuerySchema, transferProjectSchema } from "../lib/validation.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireDb } from "../middleware/requireDb.js";
import { requireUser } from "../middleware/requireUser.js";
import Folder from "../models/Folder.js";
import Icon from "../models/Icon.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { recordRequestActivity } from "../services/activityLogService.js";
import { adminStats, bulkDeleteProjects, bulkTransferProjects, deleteUser, listUsers, transferProject } from "../services/adminService.js";

const router = Router();
router.use(requireDb, requireUser, requireAdmin);

// Workspace totals (users, projects, icons, tokens) for the header cards of the admin screens.
router.get("/stats", async (_req, res) => {
  res.json(await adminStats());
});

router.get("/users", async (req, res) => {
  res.json(await listUsers(actorOf(req), listUsersQuerySchema.parse(req.query)));
});

// Body: { transferTo?: userId }. Without it the user's projects are deleted with them.
router.delete("/users/:userId", async (req, res) => {
  const actor = actorOf(req);
  const input = deleteUserSchema.parse(req.body ?? {});
  const userId = parseObjectId(req.params.userId, "user id");
  const transferTo = input.transferTo ? parseObjectId(input.transferTo) : null;
  const projects = await Project.find({ ownerId: userId }).lean();
  const ownerName = (await User.findById(userId).select({ displayName: 1 }).lean())?.displayName ?? "Unknown user";
  const newOwnerName = transferTo ? (await User.findById(transferTo).select({ displayName: 1 }).lean())?.displayName : undefined;
  const counts = new Map(
    await Promise.all(
      projects.map(async (project) => [
        String(project._id),
        {
          deletedIcons: await Icon.countDocuments({ projectId: project._id }),
          deletedFolders: await Folder.countDocuments({ projectId: project._id }),
        },
      ] as const),
    ),
  );
  const result = await deleteUser(actor, userId, transferTo);
  for (const project of projects) {
    const snapshot = { _id: project._id, name: project.name, ownerId: transferTo ?? project.ownerId };
    if (transferTo) {
      await recordRequestActivity(req, snapshot, {
        actionDone: "transfer",
        entityType: "project",
        entityId: project._id,
        entityName: project.name,
        details: { previousOwnerId: String(project.ownerId), newOwnerId: String(transferTo), newOwner: newOwnerName },
      });
    } else {
      const deleted = counts.get(String(project._id));
      await recordRequestActivity(req, snapshot, {
        actionDone: "delete",
        entityType: "project",
        entityId: project._id,
        entityName: project.name,
        ownerName,
        details: { deletedIcons: deleted?.deletedIcons ?? 0, deletedFolders: deleted?.deletedFolders ?? 0, deletedWithOwnerAccount: true },
      });
    }
  }
  res.json(result);
});

router.post("/projects/bulk-transfer", async (req, res) => {
  const input = bulkTransferSchema.parse(req.body ?? {});
  const actor = actorOf(req);
  const projectIds = input.projectIds.map((id) => parseObjectId(id));
  const newOwnerId = parseObjectId(input.userId);
  const newOwner = await User.findById(newOwnerId).select({ displayName: 1 }).lean();
  const projects = await Project.find({ _id: { $in: projectIds } }).lean();
  const result = await bulkTransferProjects(projectIds, newOwnerId, actor);
  const failed = new Set(result.failed.map((item) => item.id));
  for (const project of projects) {
    if (failed.has(String(project._id))) continue;
    await recordRequestActivity(req, { _id: project._id, name: project.name, ownerId: newOwnerId }, {
      actionDone: "transfer",
      entityType: "project",
      entityId: project._id,
      entityName: project.name,
      details: { previousOwnerId: String(project.ownerId), newOwnerId: String(newOwnerId), newOwner: newOwner?.displayName },
    });
  }
  res.json(result);
});

router.post("/projects/bulk-delete", async (req, res) => {
  const input = bulkDeleteProjectsSchema.parse(req.body ?? {});
  const projectIds = input.projectIds.map((id) => parseObjectId(id));
  const projects = await Project.find({ _id: { $in: projectIds } }).lean();
  const counts = new Map(
    await Promise.all(
      projects.map(async (project) => [
        String(project._id),
        {
          deletedIcons: await Icon.countDocuments({ projectId: project._id }),
          deletedFolders: await Folder.countDocuments({ projectId: project._id }),
        },
      ] as const),
    ),
  );
  const result = await bulkDeleteProjects(projectIds);
  const failed = new Set(result.failed.map((item) => item.id));
  for (const project of projects) {
    if (failed.has(String(project._id))) continue;
    const deleted = counts.get(String(project._id));
    await recordRequestActivity(req, { _id: project._id, name: project.name, ownerId: project.ownerId }, {
      actionDone: "delete",
      entityType: "project",
      entityId: project._id,
      entityName: project.name,
      details: { deletedIcons: deleted?.deletedIcons ?? 0, deletedFolders: deleted?.deletedFolders ?? 0, deletedByAdmin: true },
    });
  }
  res.json(result);
});

router.post("/projects/:projectId/transfer", async (req, res) => {
  const actor = actorOf(req);
  const input = transferProjectSchema.parse(req.body ?? {});
  const project = await loadProject(actor, req.params.projectId, "manage");
  const previousOwnerId = String(project.ownerId);
  const transferred = await transferProject(project, parseObjectId(input.userId), actor);
  await recordRequestActivity(req, {
    _id: project._id,
    name: project.name,
    ownerId: parseObjectId(transferred.owner.id, "owner id"),
  }, {
    actionDone: "transfer",
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    details: { previousOwnerId, newOwnerId: transferred.owner.id, newOwner: transferred.owner.displayName },
  });
  res.json(transferred);
});

export default router;
